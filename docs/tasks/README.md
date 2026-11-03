# Task Contracts

Task 하나는 두 파일로 정의한다.

| 파일 | 역할 |
|---|---|
| `docs/tasks/TASK-0NN_NAME.md` | 목적 / 범위 / 선행 조건 / Gate / 완료 조건 (Human이 읽고 승인) |
| `harness/tasks/TASK-0NN.json` | Orchestrator 실행 Contract: allowed / forbidden paths, verify 명령 (형식: `docs/12-ORCHESTRATOR-DESIGN.md`) |

공통 규칙은 [COMMON.md](COMMON.md)를 따른다.

## 실행 순서

| Task | 제목 | 초기 상태 | 실행 방식 | 핵심 Gate |
|---|---|---|---|---|
| [TASK-001](TASK-001_REQUIREMENTS_GATE.md) | Requirements / Gate A | DONE | Claude Code 세션 + Human 결정 | DEC-002 ~ DEC-005 |
| [TASK-002](TASK-002_PROJECT_BOOTSTRAP.md) | Project Bootstrap | DONE | Orchestrator | DEC-002, Version Gate C |
| [TASK-003](TASK-003_AI_CLIENT.md) | AiClient / Fake / Anthropic / 비용 Guard | DONE | Orchestrator | DEC-004 |
| [TASK-004](TASK-004_IMAGE_SLICING.md) | 이미지 업로드 검증 / 세로 분할 | DONE | Orchestrator | — |
| [TASK-005](TASK-005_ANALYSIS_ENGINE.md) | 분석 엔진 + /api/analyze | DONE | Orchestrator | DEC-009 |
| [TASK-006](TASK-006_ANALYSIS_UI.md) | 분석 입력 / 리포트 화면 | READY | Orchestrator | — |

TASK-002 이후는 TASK-001에서 승인된 `docs/06-PLAN.md`를 기준으로 등록한다.

## 사용 방법

1. Human이 Task 문서와 JSON Contract를 검토 / 승인한다.
2. Human이 Task Branch를 만든다: `git switch -c task/TASK-0NN-<slug>`
3. Contract를 Commit해 Working Tree를 clean 상태로 만든다.
4. `node scripts/orchestrator/run.mjs TASK-0NN`
5. `HUMAN_REQUIRED` / `BLOCKED`로 정지하면 `.harness/runs/<run-id>/state.json`을 확인하고, 해결 후 `resume-approval.json`을 넣어 `--resume`한다.
6. PASS 후 (`git_automation`이 꺼져 있으면) Human이 Workspace Diff를 반영해 Commit / PR을 만든다.

## 상태 전환 원칙

`READY → IN_PROGRESS → REVIEW → DONE`을 유지한다. 승인이 필요하면 `BLOCKED`로 멈춘다.
