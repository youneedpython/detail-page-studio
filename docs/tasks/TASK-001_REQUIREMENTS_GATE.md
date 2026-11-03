# TASK-001 — Requirements / Gate A (제품 명세 · 기술 스택 · 데이터 수집 방식 결정)

## 목적

구현 전에 제품 범위와 핵심 기술 결정을 확정해 이후 Task Contract의 기준을 만든다.

## 실행 방식

Orchestrator Contract 없음. Human 지시에 따라 Claude Code 세션이 문서 초안과 선택지를 만들고, Human이 결정한다.

## 범위

1. `docs/01-PROJECT.md`: 대상 사용자, 핵심 기능(분석 / 제작), MVP 범위, 제외 범위 확정
2. `docs/09-DECISIONS.md`의 PENDING 결정 확정
   - DEC-002 기술 스택 (Gate A)
   - DEC-003 상세페이지 데이터 수집 방식 (크롤링 / 공식 API 범위, 법적 · 약관 리스크)
   - DEC-004 분석 · 생성 AI 모델과 비용 상한
   - DEC-005 GitHub Remote / Branch Ruleset / `git_automation` 활성화
3. `docs/03-UX_UI_SPEC.md`, `docs/04-ARCHITECTURE.md`, `docs/05-API_SPEC.md` 초안
4. `docs/06-PLAN.md` Milestone / 작업 순서 / 검증 방법 / Gate 작성
5. 승인된 Plan에 따라 TASK-002 이후를 `docs/07-TASKS.md`와 `docs/tasks/`, `harness/tasks/`에 등록

## 범위 밖

- 앱 코드 작성, Dependency 설치
- 실제 스마트스토어 페이지 수집, 외부 API 호출

## Human Approval 또는 Gate

- Gate A: 기술 스택 / 주요 Version
- Gate B: 분석 항목 · 점수 기준, 생성 규칙
- 외부 연동 / 크롤링 범위 Human Approval
- `docs/06-PLAN.md` Human Approval

## 완료 조건

- DEC-002 ~ DEC-005가 Human Approved 또는 명시적 보류로 기록됨
- `docs/06-PLAN.md` Human Approved
- TASK-002 Task 문서와 JSON Contract가 등록되고 `scripts/verify.*`에 앱 검증 단계 추가 계획이 포함됨
