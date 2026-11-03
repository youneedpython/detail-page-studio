# TASK-005 분석 엔진 실행 지시

- 목적: 업로드 캡처를 승인된 분석 기준으로 해석하고 AnalysisReport를 반환한다.
- 실행 단계: 승인된 TASK-005 Executor 구현.
- 사용 Context: AGENTS.md, 필수 프로젝트 문서, DEC-002~009, TASK-005 Contract, 기존 AI / 이미지 / 비용 모듈.
- 실제 Prompt: "Implement only this explicitly requested Task within allowed_paths. Never commit, push, create branches, or bypass Human Gates. Read the Task source and its required context before editing. Return only the supplied executor JSON schema." 요청에 첨부된 TASK-005 범위대로 Schema, 한국어 Prompt, 엔진, Fake 샘플, Handler, Route 및 네트워크 없는 Test를 구현한다.
- 기대 산출물: 분석 API와 Test, 작업 상태 및 검증 기록. 기존 API Contract와 Dependency는 유지한다.
- Human Approval 여부: 명시적 실행 지시 및 DEC-009 분석 기준 승인. 추가 Gate 결정 없음.
- 결과: 분석 엔진과 API 구현. Executor 참고 검사와 최종 Orchestrator 검증은 작업 기록에서 구분한다.
- Related Commit: 없음. Executor는 Git handoff를 수행하지 않는다.
