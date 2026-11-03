# TASK-004 실행 지시 기록

- 목적: 상세페이지 업로드 검증과 분석용 세로 분할 구현.
- 실행 단계: 승인된 TASK-004 Executor 구현.
- 사용 Context: AGENTS.md, 필수 프로젝트 문서, COMMON, TASK-004 Contract, DEC-002 부속의 sharp 승인.
- 실제 Prompt: “Implement only this explicitly requested Task within allowed_paths. Never commit, push, create branches, or bypass Human Gates.” 제공된 TASK-004 범위에 따라 이미지 타입, 업로드 검증, 세로 분할, 공개 API, 생성 이미지 Test와 작업 기록을 작성한다.
- 기대 산출물: src/lib/image 모듈 및 Test, TASKS / WORK_LOG 갱신, Executor JSON.
- Human Approval 여부: 명시적 Task 실행 지시 및 DEC-008 / sharp 0.35.5 승인 범위. 추가 Gate 없음.
- 결과: 업로드 형식 / 크기 / 장수 검증과 EXIF 회전, 흰 배경 JPEG 분할 구현. API Route / UI / 외부 AI 호출은 범위 밖이다.
- Related Commit: 없음. Executor는 Git 후속 작업을 수행하지 않는다.
- Rework 지시: 제공된 R-001 ~ R-004만 반영한다. 상태 정의 / Current Task 표기, 실제 resize와 계획 높이 일치, 홀수 비율 Test, Sandbox 관찰과 Orchestrator 최종 검증 결과 구분을 수정한다. 추가 승인이나 Git 작업은 수행하지 않는다.
