# 11. Multi-Agent Orchestration Policy

## 1. 목적 / 상태

- 상태: `Adopted (DEC-001, Human 지시 2026-11-03)`
- 출처: MoodFit v3에서 검증된 Harness 정책(DEC-026 계열)을 이 프로젝트에 맞게 옮겼다. AWS / 배포 관련 규칙은 제외했으며, 배포 정책은 별도 Gate에서 정한다.
- 목적: Codex 실행 → Deterministic Verification → Claude 자동 Review → Rework / Human Gate 흐름을 사용한다. Human이 Agent 사이에서 결과를 옮기지 않는다.

## 2. 역할 / 권한 / 금지

| 역할 | 권한 | 금지 |
|---|---|---|
| Codex / Executor | Human이 실행 지시한 READY Task의 허용 경로에서 Working Tree 수정 / Test / 문서화, Finding에 따른 Rework | 임의 Task 시작 / 범위 확대 / Gate 결정 / 독자 Commit / Push / PR / Merge |
| Claude / Reviewer | 완전 Read-only로 Task Contract / 실제 Diff / Verification / 승인 Decision 검토, Verdict / Finding 작성 | Source / 문서 / Git 수정, 배포, 승인 대행, 임의 실행 도구 사용 |
| Orchestrator | 승인된 실행 순서 / Verification / Review / 반복 횟수 / Gate 정지를 결정적으로 제어 | 권한 확대, Gate 우회, 무한 반복, 승인 전 Git / 배포 자동화 |
| Human | Task 실행 지시, 정책 / Gate 결정, 로그인, PR 승인, 최종 Review | AI PASS를 Human Approval로 간주하지 않음 |

## 3. Agent 실행 / CLI / Sandbox

- API Key 없이 구독 로그인을 공유하는 로컬 CLI(`codex exec`, `claude -p`)를 사용한다.
- Agent는 로컬 개발 PC에서만 실행한다. GitHub Actions는 Deterministic CI만 담당한다.
- 사용량 한도 도달 시 `BLOCKED`로 정지한다. 자동 재시도 / 계정 전환 / API 우회를 금지한다.
- Claude는 Read-only 도구(Read, Grep, Glob)만 허용한다.
- Codex는 `workspace-write`와 Task 허용 경로를 적용한다. Windows Sandbox 기본값은 `elevated`다.
- CLI 실행 파일 경로는 `harness/config.local.json`에 두고 Preflight에서 Version을 확인한다. 무승인 설치 / 업데이트를 금지한다.

## 4. Human Gate

| 대상 | 승인 기준 |
|---|---|
| 기술 스택 / Major Version / Dependency | 추가 / 변경 전 Gate A 또는 C |
| 분석 · 생성 Business Rule | 변경 전 Gate B |
| 데이터 수집(크롤링) 대상 / 빈도 / 방식 | 변경 전 Human Approval |
| 외부 API 연동 (네이버, LLM, Vision, 이미지 생성) | 추가 / 변경 전 Human Approval |
| 유료 API 비용 상한 | 설정 / 확대 전 Human Approval |
| API Contract / DB Schema | 변경 전 Human Approval |
| CI 동작 | Trigger / Workflow 변경 전 Gate C |
| GitHub Permission / Git 자동화 | 권한 확대 / Ruleset / `git_automation` 활성화 전 Human Approval |
| 배포 / 비용 Resource | 별도 Gate 승인 전 수행하지 않음 |
| Secret 정책 | 전달 / 저장 / 접근 / Log 정책 변경 전 Human Approval |
| 기존 기능 삭제 / 요구사항 축소 / 인증 / 최상위 구조 | AGENTS.md 승인 규칙 유지 |

- Gate가 필요하면 `HUMAN_REQUIRED`로 정지하고 사유 / 대안 / 권장안 / Diff / Verification을 제공한다.
- 승인은 Task / 변경 범위 / 검토 대상 Commit 또는 Diff에 연결한다. 범위 밖 승인을 추론하지 않는다.

## 5. Human 승인 채널

- Task 완료 승인 = Human이 PR을 Squash Merge하는 행위다. Agent / Orchestrator는 Merge하지 않는다.
- Agent와 Human이 같은 GitHub 계정의 `gh` 로그인을 사용하므로 Required approvals는 0으로 두고 Required status check(`verify`)로 CI를 강제한다. Auto Merge는 비활성으로 유지한다.
- 정지된 Run은 `resume-approval.json`으로만 재개한다(형식: docs/12).

## 6. 로그인 / 자격 증명

- GitHub CLI(`gh`)는 Human이 설치 / 로그인한다. 계정명 / Token은 기록하지 않는다.
- 로그인 만료 / 미확인 시 재로그인하지 않고 `HUMAN_REQUIRED`로 정지한다.
- 앱 런타임 API Key(네이버 / LLM 등)는 Agent 입력 / Prompt / Log / Task 문서에 넣지 않는다. Verify가 실제 외부 API를 호출하지 않도록 Test는 Fake / Fixture를 사용한다.

## 7. Git / Merge

- Task 하나 = Branch 하나 = PR 하나. Branch 이름은 `task/TASK-0XX-<짧은-이름>`.
- `main` 직접 Push / Force Push / History Rewrite / Merge / Auto Merge를 금지한다.
- Orchestrator Git 자동화는 `git_automation: true`에서만 동작하며, Deterministic Verification 성공 + Executor DONE + Claude PASS + 미해결 Human Gate 없음일 때만 allowed_paths 개별 Stage / Commit / Push / Draft PR을 수행한다.
- `git_automation`을 켜기 전 필요 조건: GitHub Remote, `main` Branch Ruleset(Force Push 금지 / PR 필수 / Required check `verify` / Squash 전용 / Bypass 없음), Human 승인.
- Commit 형식은 `docs:` / `feat:` / `test:` / `ci:` / `chore:` + 한국어 요약 + `- ` 목록이며, Codex 작업이 포함되면 Codex Co-author Trailer를 붙인다.

## 8. Review Loop

- 흐름: Preflight → Workspace → Execute → Guard → Verify → Review → Decide
- `MAX_REVIEW_CYCLES=3`: 첫 Review를 1회로 센다. 3번째 판정도 `CHANGES_REQUIRED`이면 `HUMAN_REQUIRED`로 정지한다.

| Verdict | 처리 |
|---|---|
| `PASS` | Verification 성공 / Gate 충족을 별도로 확인한다. 남은 Human Review / 승인은 유지한다 |
| `CHANGES_REQUIRED` | Finding을 Codex에 전달해 같은 Task 범위에서 Rework → Verify → Review한다 |
| `HUMAN_REQUIRED` | Gate / 로그인 / 반복 상한 사유를 기록하고 즉시 정지한다 |
| `BLOCKED` | 사용량 한도 / 실행 실패 / Timeout / Verification 실패 / 계약 오류로 즉시 정지한다 |

- Executor / Reviewer 결과 JSON을 Schema로 검증한다. 형식 오류 / 미허용 Verdict는 `BLOCKED`다.
- `changed_files`와 실제 변경 경로(신규 / 비추적 포함)를 대조한다. 불일치 / 허용 경로 위반은 `BLOCKED`다.

## 9. Deterministic Verification / AI Review / Secret / Log

- Deterministic Verification은 Exit Code / Test / Build / Schema / 변경 경로 / 반복 횟수 / Gate 상태를 검사한다. 실패를 AI PASS로 덮어쓰지 않는다.
- AI Review는 요구사항 / 승인 Decision 준수와 Diff의 품질 / 누락 / 위험을 검토한다. 미실행 Test를 통과로 판단하지 않는다.
- Reviewer 입력은 Task Contract + Task 문서 + 실제 `git diff` + Verification Log로 한정한다.
- Run 기록은 Git 비추적 `.harness/runs/<run-id>/`에 Redaction 후 저장한다.
- Contract의 `secret_scan_allow`에는 Human이 승인한 정확한 문구만 둔다. Executor는 자기 Contract를 수정할 수 없다.
- Git 비추적 ignored Secret(예: `.env.local`)은 존재만으로 Git 자동화를 차단하지 않지만, changed_files / Stage 대상 / staged 목록에 Secret 경로가 있으면 `BLOCKED`다.
