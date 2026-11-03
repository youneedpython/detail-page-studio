# 08 — TASK-008 상품 입력 / 템플릿 / 편집기 실행 지시

- 목적: 내 상품 정보와 사진 설명으로 초안을 생성하고 브라우저에서 편집한다.
- 실행 단계: 승인된 TASK Execution / Executor 구현.
- 사용 Context: AGENTS.md, 프로젝트·UX·아키텍처·API 명세, 승인 Decision, 계획, 공통 실행 규칙, TASK-008 Contract 및 생성 규칙.
- 실제 Prompt: "TASK-008만 allowed_paths 안에서 구현한다. 초안 localStorage, 내 사진 IndexedDB와 메모리 대체, 상품 입력과 생성 요청, 템플릿 6종, 섹션 편집과 자동 저장, 홈 최근 초안, 테스트 및 기록을 작성한다. 사진 파일을 서버로 보내지 않는다. Git 작업과 Gate 우회를 금지한다. 결과는 Executor JSON으로 반환한다."
- 기대 산출물: 상품 입력 / 편집 화면, 브라우저 저장소, 템플릿, 외부 API 없는 테스트, 상태와 작업 기록.
- Human Approval 여부: 명시적인 Task 실행 지시와 DEC-008 / DEC-010 승인 범위. 신규 Dependency와 Gate 없음.
- 결과: 구현 완료. Orchestrator 최종 검증 / 자동 리뷰와 Claude 세션 화면 캡처가 별도로 필요하다.
- Related Commit: 없음. Executor는 Commit을 수행하지 않는다.
