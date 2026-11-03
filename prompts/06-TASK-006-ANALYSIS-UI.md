# 06 — TASK-006 분석 입력 / 리포트 화면

- 목적: 캡처 업로드부터 분석 리포트 열람까지 승인된 사용자 흐름 구현.
- 실행 단계: TASK-006 Executor 구현. 선행 TASK-005 완료.
- 사용 Context: AGENTS.md, 프로젝트 / UX / 아키텍처 / API 명세, DEC-002~009, 승인 계획, Task 목록, COMMON, TASK-006 Contract, Orchestration 정책 / 설계, 분석 기준.
- 실제 Prompt: TASK-006만 허용 경로에서 구현한다. 승인 결정과 Task Contract를 따르고 Git 작업 / Gate 우회를 하지 않는다. 리포트 저장, 메모리 이미지, 업로드와 취소 / 재시도, 리포트 및 최근 작업, 테스트와 기록을 구현한다. 결과는 Executor JSON으로 반환한다.
- 기대 산출물: 분석 입력 / 리포트 화면, 공통 클라이언트 모듈, 테스트, 작업 기록.
- Human Approval: 사용자의 명시적인 TASK-006 실행 지시, DEC-008 및 승인된 Contract. 신규 Gate 없음.
- 결과: 구현 및 참고 검증 수행. 최종 Verify / Review와 화면 캡처는 후속 실행 단계에서 확인한다.
- Related Commit: 없음 (Executor는 Commit하지 않음).
