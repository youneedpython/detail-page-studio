# TASK-009 실행 지시

- 목적: 편집한 상세페이지를 브라우저에서 PNG로 저장한다.
- 실행 단계: 승인된 TASK-009 Executor 구현.
- 사용 Context: AGENTS.md, 필수 프로젝트 문서, COMMON, TASK-009 Contract, DEC-002 부속과 DEC-007 / DEC-008.
- 실제 Prompt: "Implement only this explicitly requested Task within allowed_paths. Never commit, push, create branches, or bypass Human Gates." TASK-009의 전체 / 자동 분할 / 섹션별 PNG, 확인 대화상자, 진행 / 실패 안내와 mock Test를 구현하고 UTF-8 기록을 남긴다.
- 기대 산출물: 내보내기 순수 함수, DOM 변환 / 다운로드, 편집기 UI, Test, 작업 기록.
- Human Approval 여부: 명시적인 TASK-009 실행 지시 및 기존 Dependency 승인 범위. 새 Gate 없음.
- 결과: 구현 완료. 최종 검증 / Review와 실제 브라우저 확인은 별도로 진행한다.
- Related Commit: 없음 (Executor는 Git 변경 작업을 하지 않음).
