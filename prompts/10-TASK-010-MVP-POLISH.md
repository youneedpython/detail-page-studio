# TASK-010 실행 지시 기록

- 목적: 첫 사용자가 설정부터 분석·제작·PNG 내보내기까지 진행할 수 있도록 1단계 MVP를 정리한다.
- 실행 단계: 승인된 TASK-010 Executor 구현.
- 사용 Context: AGENTS.md, 프로젝트·UX·아키텍처·API 명세, 승인 결정과 계획, Task 목록, COMMON, TASK-010 Contract, Multi-Agent 정책과 Orchestrator 설계.
- 실제 Prompt: “TASK-010 — 1단계 MVP 정리” Contract의 allowed_paths 안에서 AI_NOT_CONFIGURED 공통 처리, 서버 props 기반 체험 모드 배너, 홈 3단계 안내, Vitest 설정 이름 변경, 한국어 README와 테스트·작업 기록을 구현한다. Git 작업과 Gate 우회를 금지하고 결과는 Executor JSON으로 반환한다. 새 화면 이미지는 추가하지 않고 기존 경로를 링크한다.
- 기대 산출물: API 설정 오류 안내, 체험 모드 표시, 사용 가이드, 관련 테스트, 상태와 검증 기록.
- Human Approval 여부: 사용자의 명시적 TASK-010 실행 지시 및 DEC-008. 추가 Dependency나 비용·외부 연동 변경 없음.
- 결과: 구현 완료. 자체 검증 결과와 Sandbox 제약은 docs/08-WORK_LOG.md에 기록하며 최종 판단은 Orchestrator 검증과 Review에 따른다.
- Related Commit: 없음(Executor는 Commit하지 않음).
