# 06. Implementation Plan

상태: `Draft (TASK-001, Human 승인 대기)`

## 1. Milestone / Task

| Milestone | Task | 내용 | 선행 | Gate |
|---|---|---|---|---|
| 1 | TASK-001 | Requirements / Gate A (이 문서) | — | DEC-002 ~ 005 |
| 2 | TASK-002 | Project Bootstrap: Next.js + TS + Vitest + ESLint, verify / CI 앱 단계 추가 | TASK-001 | DEC-002 Version 고정 (Gate C) |
| 3 | TASK-003 | AiClient 인터페이스 + Fake + Anthropic 구현, 비용 Guard | TASK-002 | DEC-004 승인, 외부 연동 |
| 3 | TASK-004 | 이미지 업로드 검증 / 세로 분할 (`lib/image`) | TASK-002 | — |
| 4 | TASK-005 | 분석 엔진 + `/api/analyze` + 분석 점수 기준 초안 | TASK-003, 004 | Gate B (점수 기준) |
| 4 | TASK-006 | 분석 입력 / 리포트 화면 | TASK-005 | — |
| 5 | TASK-007 | 생성 엔진 + `/api/generate` | TASK-003 | Gate B (생성 규칙) |
| 5 | TASK-008 | 상세페이지 템플릿 5종 + 편집기 | TASK-007 | — |
| 6 | TASK-009 | 미리보기 / PNG 내보내기 | TASK-008 | — |
| 6 | TASK-010 | 1단계 MVP 정리: 오류 상태, 반응형 캡처, README | TASK-006, 009 | Human Review |
| 7 | (2단계) | 네이버 커머스 API 연동 / 내 스토어 진단 / 비교 | 1단계 완료 | 외부 연동 Gate |
| — | (별도) | 배포 | 1단계 완료 | 배포 Gate |

## 2. 작업 순서 원칙

- AI 호출부(TASK-003)를 먼저 Fake로 고정해 이후 Task가 실제 API 없이 Test되게 한다.
- 화면 Task는 API Task가 끝난 뒤 진행한다.
- 각 Task는 Orchestrator(`node scripts/orchestrator/run.mjs TASK-0NN`)로 실행한다. TASK-002부터 적용한다.

## 3. 검증 방법

- `scripts/verify.sh`: Harness Test + (TASK-002 이후) `npm ci` / lint / typecheck / test / build
- CI `verify` Job이 같은 Script를 실행한다.
- UI Task는 390 / 768 / 1280 캡처를 `docs/images/task-0NN/`에 남긴다.
- 실제 모델 품질은 Human 수동 평가(후속 Script)로 확인하며 verify에 넣지 않는다.

## 4. Human Approval Gate

| 시점 | 승인 대상 |
|---|---|
| TASK-001 완료 | DEC-002 ~ 005, 이 Plan |
| TASK-002 시작 | 패키지 Version 목록 (Gate C) |
| TASK-003 시작 | Anthropic API 연동, 비용 상한 금액 |
| TASK-005 / 007 | 분석 점수 기준 / 생성 규칙 (Gate B) |
| 각 Task 완료 | PR Squash Merge |
