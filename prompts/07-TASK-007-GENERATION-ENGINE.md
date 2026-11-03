# 07 — TASK-007 생성 엔진 실행 지시

- 목적: 승인된 DEC-010 규칙으로 내 상품의 상세페이지 초안 생성 엔진과 API를 구현한다.
- 실행 단계: TASK Execution / Executor 구현.
- 사용 Context: AGENTS.md, 프로젝트·UX·아키텍처·API 명세, 승인 Decision, 계획, TASK-007 Contract, 공통 실행 규칙, 생성 규칙.
- 실제 Prompt: "TASK-007 생성 엔진 + /api/generate를 allowed_paths 안에서만 구현한다. 요청·출력 Schema, 한국어 Prompt, 경쟁 문구 유사도 검사와 1회 재생성, 경고와 사용량 조립, Fake 샘플, 공통 오류 처리, 테스트 및 작업 기록을 작성한다. Git 작업과 Gate 우회를 금지하고 결과는 Executor JSON으로 반환한다."
- 기대 산출물: 생성 엔진과 API, 실제 API를 호출하지 않는 테스트, 상태 및 작업 기록.
- Human Approval 여부: 사용자 명시 실행 지시, DEC-010 / DEC-008 승인 범위. 신규 Gate 없음.
- 결과: 구현 완료. 결정적 검증 및 자동 리뷰 판정은 Orchestrator에서 별도로 수행한다.
- Related Commit: 없음. Executor는 Commit을 수행하지 않는다.
