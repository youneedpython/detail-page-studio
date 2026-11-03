# 12. Local Orchestrator 설계

MoodFit v3에서 구현 / 검증된 Orchestrator를 옮겼다. AWS Profile Preflight는 제거했고, Git 단계 활성 조건을 Task 번호에서 `config.git_automation`으로 바꿨으며, PR Gate Required Check를 `verify` 한 개로 바꿨다.

## 범위 / 구성

Node.js 24 / JavaScript ES Module / Node 내장 Module만 사용한다(외부 Dependency 없음).

| 파일 | 역할 |
|---|---|
| `scripts/orchestrator/run.mjs` | 실행 / Resume / Phase 기록 / Agent와 Verify 호출 |
| `scripts/orchestrator/lib.mjs` | Process / Schema / Git Snapshot / 경로·Secret·인코딩 Guard / Redaction / 오류 분류 |
| `scripts/orchestrator/workspace.mjs` | detached worktree / Repository 공통 Lock / clean worktree 정리 |
| `scripts/orchestrator/state-machine.mjs` | Executor 요청과 Reviewer Verdict의 결정적 전이 |
| `scripts/orchestrator/status-sync.mjs` | AGENTS.md 3절 Current Task / Status 동기화와 변경 제한 Guard |
| `scripts/orchestrator/git-automation.mjs` | Stage / Commit / Push / Draft PR (`git_automation: true`일 때만) |
| `scripts/orchestrator/pr-gate.mjs` | 생성된 PR의 CI / Review / Merge 상태 1회 관찰 |
| `scripts/orchestrator/pr-description.mjs` | 한글 PR 제목 / 본문 생성 |
| `scripts/orchestrator/cleanup.mjs` | PR 생성 완료 Run의 worktree 명시적 정리 |
| `harness/tasks/<TASK-ID>.json` | 실행 Contract (allowed / forbidden paths, verify 명령) |
| `harness/schemas/` | Contract / Executor / Reviewer 결과 Schema |
| `harness/prompts/` | Executor / Reviewer 역할 Template (`{{INPUT}}` 필수) |

## State Machine

Preflight → Workspace → Execute → Guard → Verify → Review → Decide (→ Git) 순서다. Phase별 입력 / 출력과 state.json을 저장한다.

| 조건 | 전이 / 종료 |
|---|---|
| Preflight 성공 | Workspace / Execute |
| main / detached HEAD / 더러운 초기 Working Tree / 설정·계약 오류 / CLI 실행 불가 | BLOCKED |
| 로그인 만료·미확인 | HUMAN_REQUIRED, 로그인 시도 없음 |
| Executor DONE / HUMAN_REQUIRED, 계약과 Guard 정상 | Verify → Review |
| Executor FAILED / CLI 실패 / Timeout / Schema 오류 | BLOCKED |
| 변경 파일 불일치 / 경로 위반 / Symlink / Secret / 인코딩 손상 | BLOCKED, Review 호출 없음 |
| Verify 실패 / Verify 또는 Review의 Working Tree 변경 | BLOCKED, 자동 Rework 없음 |
| Reviewer BLOCKED | BLOCKED |
| Human 결정 요청 + Reviewer PASS / HUMAN_REQUIRED | HUMAN_REQUIRED |
| Reviewer CHANGES_REQUIRED | 같은 Task Finding만 Rework, 최대 3회 후 HUMAN_REQUIRED |
| Reviewer HUMAN_REQUIRED | HUMAN_REQUIRED |
| Reviewer PASS + handoff_actions 존재 | HANDOFF_PENDING |
| Reviewer PASS, 후속 작업 없음 | PASS |
| PASS / HANDOFF_PENDING + `git_automation: true` | Git Phase 후 HANDOFF_PENDING |
| Script 내부 오류 | ERROR |

PASS와 HANDOFF_PENDING은 Human 승인이나 Task DONE을 대신하지 않는다.

## 호출 규격

- 설정 명령은 실행 파일과 고정 인자의 문자열 배열이다. spawn은 `shell:false` / `windowsHide:true`다. `.cmd` / `.bat` 대신 Node와 CLI JS entry를 사용한다.
- Preflight: Git Root / Branch / Working Tree / Node 24 / CLI Version / Codex 로그인 / Timeout / 계약 확인.
- Codex: `exec -s workspace-write -c windows.sandbox="<config.sandbox>" --output-schema <strict-schema> -o <temporary-result> -`. Template / Contract / Task / Finding을 stdin으로 전달한다.
- Claude: `-p --output-format json --allowedTools Read,Grep,Glob --tools Read,Grep,Glob --strict-mcp-config`. 입력은 Template / 결과 Schema / Contract / Task / 실제 누적 Diff / Verify Log다.
- Executor 필수 필드: status / changed_files / summary / verification / human_decisions_needed / handoff_actions / pr_overview / pr_changes / pr_follow_up. Reviewer 필수 필드: verdict / findings.
- Timeout 설정은 양의 정수다. stdout / stderr는 각각 최대 8 MiB다. Timeout / 출력 초과 / SIGINT / SIGTERM 시 Process Tree를 종료한다.

## 설정 (`harness/config.local.json`, Git 비추적)

```json
{
  "codex": {"command": ["node", "<absolute path to @openai/codex/bin/codex.js>"]},
  "claude": {"command": ["<absolute path to VS Code extension claude.exe>"]},
  "sandbox": "elevated",
  "git_automation": false,
  "timeouts": {"preflight_ms": 30000, "executor_ms": 900000, "reviewer_ms": 300000, "verify_ms": 900000}
}
```

- `sandbox`: `elevated` / `unelevated` 외 값은 BLOCKED.
- `git_automation`: 생략 또는 `false`면 Git Phase를 실행하지 않는다. boolean이 아니면 BLOCKED.

## Task Contract / Guard

- 필수: id(`TASK-\d{3}`) / title / task_file / allowed_paths / forbidden_paths / verify / max_review_cycles=3. 선택: `secret_scan_allow`, `agents_sections`.
- 경로는 정확한 파일 또는 `/`로 끝나는 디렉터리 Prefix다. Glob은 지원하지 않고 forbidden_paths가 우선한다. 절대 경로 / 역슬래시 / `..` / `.git` / 중복 보고 / Symlink를 거부한다.
- 실행 중인 Task의 `harness/tasks/<id>.json`은 allowed_paths에 포함돼도 변경을 차단한다.
- changed_files는 최초 clean baseline 이후 누적 전체 목록이며 staged / unstaged / 삭제 / untracked를 모두 포함한다.
- Secret 파일과 알려진 Token Prefix / Private Key / Password·Secret·API Key 할당을 차단한다. tracked Diff는 추가 줄, untracked는 전체 내용을 검사한다.
- 인코딩 Guard: 추가 줄과 untracked 내용에 물음표 3개 이상의 연속 치환 흔적 또는 U+FFFD가 있으면 BLOCKED다. 한글 문서는 UTF-8 보장 수단으로 작성한다.
- AGENTS.md는 3절 Current Task / Status 코드 블록 값만 `docs/07-TASKS.md`와 동기화할 수 있다. Contract에 `agents_sections: ["<절 번호>"]`가 Human 승인으로 명시된 경우에만 해당 절 본문 변경을 허용한다.

## Contract 예시

```json
{
  "id": "TASK-002",
  "title": "Project Bootstrap",
  "task_file": "docs/tasks/TASK-002_PROJECT_BOOTSTRAP.md",
  "allowed_paths": ["frontend/", "docs/07-TASKS.md", "docs/08-WORK_LOG.md", "prompts/"],
  "forbidden_paths": ["harness/", "scripts/orchestrator/", ".github/", "AGENTS.md", ".env.local"],
  "verify": [
    { "command": ["bash", "scripts/verify.sh"], "cwd": "." },
    { "command": ["git", "diff", "--check"], "cwd": "." }
  ],
  "max_review_cycles": 3
}
```

## 실행 / 작업 공간 / Lock

Human이 Task Branch(`task/TASK-0XX-<slug>`) / clean Working Tree / `harness/config.local.json`을 준비하고 Git Root에서 실행한다.

```bash
node scripts/orchestrator/run.mjs TASK-0XX            # 실행
node scripts/orchestrator/run.mjs TASK-0XX --config <path>
node scripts/orchestrator/run.mjs --resume <run-id>   # 정지 Run 재개
node scripts/orchestrator/pr-gate.mjs <run-id>        # PR CI / Merge 상태 1회 관찰
node scripts/orchestrator/cleanup.mjs <run-id>        # PR 생성 완료 Run의 worktree 정리
```

- Repository 공통 Git directory의 realpath Hash로 OS 임시 경로(`harness-orchestrator-locks`)에 exclusive-create Lock을 만든다. stale Lock은 자동 제거하지 않는다.
- `.harness/workspaces/<run-id SHA-256 앞 16자리>`에 승인 HEAD의 detached worktree를 만들고 Execute / Guard / Verify / Review를 그 안에서 실행한다. Human 작업 폴더의 소스는 변경하지 않는다.

## Git 계층 (`git_automation: true`)

- Human이 준비한 `task/<Task ID>-<slug>` Branch와 최초 HEAD를 고정한다.
- 검토된 누적 Diff를 다시 Guard하고 Source Branch / HEAD / clean Working Tree 충돌, `gh` 인증, `origin/main` 읽기 접근을 확인한다. 인증 실패는 HUMAN_REQUIRED다.
- 같은 Branch / Task ID의 open PR이나 원격 SHA 충돌은 BLOCKED다.
- allowed_paths 안의 파일별 literal pathspec Stage → staged 목록 Secret 검사 → Commit(Task ID + 제목, Codex / Claude Trailer) → Force 없는 Push → `gh pr create --draft --base main`.
- 실패 후 자동 Rollback / 재시도는 없다.

## PR 관찰 (`pr-gate.mjs`)

- `ci.yml`의 최신 current head `pull_request` Run에서 `REQUIRED_CHECKS`(`verify`) Job이 completed / success일 때만 HUMAN_REVIEW_PENDING이다. 누락 / pending은 CI_PENDING, non-success는 BLOCKED다.
- Changes Requested는 REWORK_REQUIRED로 정지한다. PR Approve / Label / Comment는 완료 승인이 아니다.
- MERGED는 merged_by / merge SHA / 단일 parent 근거를 기록한다. Merge / Auto Merge / 다음 Task 실행은 수행하지 않는다.
- CI Job 이름을 바꾸면 `pr-gate.mjs`의 `REQUIRED_CHECKS`와 Branch Ruleset Required Check를 함께 바꾼다(Gate C).

## Resume

Human이 정지 사유와 Diff를 검토하고 원인을 해결한 뒤 Run directory에 `resume-approval.json`을 제공한다.

```json
{
  "run_id": "stopped-run-id",
  "snapshot_hash": "recorded-snapshot-hash",
  "stop_reason": "recorded-stop-reason",
  "approved": true,
  "reference": "Human 승인 기록의 비민감 참조"
}
```

- Lock / HUMAN_REQUIRED 또는 BLOCKED 상태 / Repository identity / HEAD / 누적 Snapshot Hash / 승인 정보를 확인한다. 승인 기록은 보존하고 입력 파일은 소비한다.
- frozen.json은 설정 / Contract / Task / Schema / Template / 작업 공간 / baseline HEAD를, checkpoint.json은 cycle / Finding / Guard 통과 Executor 결과를 보존한다.
- Resume에서도 Review는 누적 최대 3회다. Contract는 `secret_scan_allow`만 변경할 수 있다.

## 기록 / Exit Code

Run ID는 UTC Timestamp + UUID다. `.harness/runs/<run-id>` / workspace / `config.local.json`은 Git 비추적이다. 기록은 저장 전 Redaction한다.

| 종료 상태 | Exit Code |
|---|---:|
| PASS / HANDOFF_PENDING | 0 |
| ERROR | 1 |
| HUMAN_REQUIRED | 2 |
| BLOCKED | 3 |

## 검증

- `node --test scripts/orchestrator/*.test.mjs`: Fake CLI / 임시 Git Repository로 State Machine / Guard / worktree / Lock / Resume / AGENTS 동기화 / Git 자동화 / PR Gate / 오류 분류를 검증한다. `scripts/verify.sh`와 CI에 포함되어 있다.
- Deterministic Verification은 Orchestrator가 Sandbox 밖에서 실행한다. Executor 자체 Test는 참고 증거다.
