# 공통 실행 규칙

모든 Task 파일은 이 문서를 전제로 한다. Task 파일과 이 문서가 다르면 Task 파일의 더 구체적인 규칙을 따르고, 둘 다 `docs/09-DECISIONS.md`의 승인 결정과 다르면 승인 결정을 우선한다.

## 1. 역할

| 역할 | 담당 | 권한 |
|---|---|---|
| Executor | Codex | 승인된 Task 범위 안에서 구현 / 테스트 / 문서화. Working Tree만 수정한다 |
| Reviewer | Claude | Read-only. Diff, Task Contract, Verification 결과, 승인된 Decision을 검토하고 Verdict를 낸다 |
| Orchestrator | `scripts/orchestrator/run.mjs` | 실행 순서, Deterministic Verification, Review 호출, (승인 시) Git / PR 작업을 제어한다 |
| Claude Code 세션 | Claude | DEC-008 위임: Gate 결정 기록, Push / PR / Squash Merge, Orchestrator 실행 |
| Human | 사용자 | 방향 결정, 위임 예외 항목, 로그인(GitHub) |

Reviewer Verdict는 `PASS`, `CHANGES_REQUIRED`, `HUMAN_REQUIRED`, `BLOCKED`만 사용한다.

## 2. Agent 실행 방식

- Codex와 Claude는 **API Key를 사용하지 않는다.** 구독 계정 로그인을 공유하는 로컬 CLI(`codex`, `claude`)로 실행한다.
- 실행: `node scripts/orchestrator/run.mjs <TASK-ID>`. Codex 실행 후 Claude 검토가 자동으로 이어진다.
- 명세 / Gate 문서 작업처럼 Orchestrator Contract가 없는 Task는 Human 지시에 따라 Claude Code 세션이 수행하고 Human이 승인한다.
- GitHub Actions에서는 Agent를 실행하지 않는다(Deterministic CI만 담당).
- 구독 사용량 한도에 도달하면 자동 재시도하지 않고 `BLOCKED`로 멈춘다.

## 3. 로그인 / 자격 증명

- Human이 로그인하고 이후 작업은 Agent가 진행한다(GitHub: `gh auth login`).
- 로그인이 만료되었거나 확인되지 않으면 재로그인을 시도하지 않고 `HUMAN_REQUIRED`로 멈춘다.
- 앱 런타임용 API Key(네이버 / LLM 등)는 `.env.local`(Git 비추적)에만 둔다. Task 문서, Prompt, Log, Contract에 값을 쓰지 않는다.
- Verify / Test는 실제 외부 API나 실제 스마트스토어 페이지를 호출하지 않는다. Fake / 저장된 Fixture를 사용한다.

## 4. Source of Truth

1. `AGENTS.md`
2. `docs/01-PROJECT.md` ~ `docs/05-API_SPEC.md`
3. `docs/06-PLAN.md`, `docs/07-TASKS.md`
4. `docs/08-WORK_LOG.md`
5. `docs/09-DECISIONS.md`
6. `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md`, `docs/12-ORCHESTRATOR-DESIGN.md`
7. `docs/tasks/` 해당 Task 파일
8. `prompts/README.md`

`README.md`는 프로젝트 소개 문서이며 진행 상태의 기준이 아니다.

## 5. Baseline

- Harness: MoodFit v3 Orchestrator 이식, AWS 제거 (DEC-001)
- Runtime: Node.js 24.21.0 (`.nvmrc`) — Orchestrator 실행용. 앱 기술 스택은 미정(Gate A)
- Decision 다음 번호: DEC-002

## 6. 공통 금지

- 승인되지 않은 Dependency / Major Version / API Contract / DB Schema / Architecture 변경
- 승인되지 않은 외부 API 연동, 크롤링 대상 / 방식 추가
- `main` 직접 Push, Force Push, History Rewrite
- Secret, Token, Password, API Key를 Source / Prompt / Log에 기록
- 실패한 Test / Build를 숨기거나 성공으로 처리
- 다음 Task 선행 구현
- Human Gate가 필요한 결정을 Agent가 임의로 확정

## 7. 작업 종료 보고

`git diff --check`, 관련 Test / Build / Verification 결과, 변경 파일 목록, 남은 Gate / Issue를 보고한다.

## 8. `docs/07-TASKS.md` 작성 형식

1. **표("4. 전체 Task 목록")**: Task 번호 순서에 맞는 자리에 한 행만 둔다. "Human Approval" 칸에는 승인 근거만 적는다(예: `Human 지시 2026-11-03`).
2. **절**: `## 5. Human Approval 필요 Task` **앞**, 번호 순서에 맞는 자리에 둔다. 절과 절 사이는 `---`로 나눈다.
3. **절의 구성**:

   ````markdown
   ## TASK-0NN — 영문 이름 (한글 설명)

   ### 상태

   ```text
   READY
   ```

   Milestone NN. 선행: TASK-0AA. (경과 한두 문장)

   ### 목적

   ### Human Approval 또는 Gate

   ### 완료 조건

   ### 상세 Task Contract

   [`docs/tasks/TASK-0NN_NAME.md`](tasks/TASK-0NN_NAME.md) (공통 규칙: [`docs/tasks/COMMON.md`](tasks/COMMON.md))

   ---
   ````

4. "3. Current Task"는 `TASK-0NN — 이름` 한 줄과 `Status:` 코드 블록 형식을 유지한다. Orchestrator가 AGENTS.md 3절과 이 값을 대조한다.
