# 09. Decisions

승인된 제품 · 기술 · 아키텍처 결정의 최종 기록이다. 상태는 `Human Approved` / `PENDING` / `Rejected` / `Superseded`를 사용한다. 다음 번호: **DEC-006**

---

## DEC-001 — Multi-Agent Harness 도입

- 상태: `Human Approved (Human 지시 2026-11-03)`
- 결정: MoodFit v3의 Harness(Orchestrator / Schema / Prompt / Policy)를 이식한다. Codex = Executor, Claude = Read-only Reviewer, Human = Gate.
- 변경점: AWS Profile Preflight 제거, Git 자동화는 `git_automation` 설정으로만 활성화, PR Required Check는 `verify` 1개.
- 근거 문서: `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md`, `docs/12-ORCHESTRATOR-DESIGN.md`

---

## DEC-002 — 기술 스택 (Gate A)

- 상태: `PENDING`
- 결정할 것: Frontend / Backend 언어·프레임워크, DB, 이미지 렌더링(상세페이지 → 이미지 내보내기), 헤드리스 브라우저 사용 여부, 배포 대상
- 고려: Harness가 Node.js 24 기반이므로 TypeScript 단일 스택이 verify / CI 구성이 가장 단순하다. 크롤링 / 이미지 렌더링에 Playwright를 쓰면 Node / Python 모두 가능하다.

---

## DEC-003 — 상세페이지 데이터 수집 방식

- 상태: `PENDING`
- 사실 관계 (TASK-001에서 최신 약관 / 문서로 재확인 필요):
  - 네이버 커머스 API(공식)는 **판매자 본인 스토어**의 상품 조회 / 등록 / 수정용이다. 다른 스토어의 상세페이지를 읽는 용도가 아니다.
  - 네이버 검색 API(쇼핑)는 상품명 / 가격 / 링크 / 이미지 등 목록 정보만 준다. 상세페이지 본문은 주지 않는다.
  - 타 스토어 상세페이지 본문을 얻을 공식 API는 없다. 수집하려면 웹 페이지 자체를 가져와야 하며, 네이버는 자동 수집을 약관 / robots / 봇 차단으로 제한한다.
  - 상세페이지 본문은 대부분 이미지라서 수집 후 OCR / Vision 분석이 필요하다.
- 선택지:
  - A. 공식 API만 사용 + 타 스토어는 사용자가 캡처 이미지를 업로드
  - B. A + 사용자가 입력한 URL 1건을 요청 시점에 헤드리스 브라우저로 가져오기(대량 / 주기 수집 없음, 실패 시 캡처 업로드로 안내)
  - C. 대량 / 주기 크롤링
- 제품 순서 (Human 결정 2026-11-03): 남의 스토어 분석을 먼저 하고 내 스토어 분석은 다음에 한다. 따라서 1단계부터 URL 수집 또는 캡처 업로드가 필요하고, 커머스 API는 2단계에서 필요하다.
- 권장안: **B**. 크롤링과 API를 모두 쓰되, 크롤링은 "사용자가 지정한 URL 1건, 요청 시점, 속도 제한" 범위로 좁히고 캡처 업로드를 항상 대체 경로로 둔다. C는 약관 · 차단 · 법적 리스크 때문에 MVP에서 제외한다.

---

## DEC-004 — 분석 · 생성 AI 모델과 비용 상한

- 상태: `PENDING`
- 결정할 것: OCR / Vision 분석 모델, 카피 생성 LLM, (선택) 이미지 생성 모델, 요청당 / 월 비용 상한, API Key 보관 방식
- 원칙: 앱 런타임 API Key는 Agent(Codex / Claude CLI) 실행 자격과 분리해 `.env.local` / Secret으로만 둔다. Test는 Fake 응답을 사용한다.

---

## DEC-005 — GitHub Remote / Branch Ruleset / Git 자동화

- 상태: `PENDING`
- 결정할 것: GitHub Repository 생성, `main` Ruleset(Force Push 금지 / PR 필수 / Required check `verify` / Squash 전용 / Bypass 없음), `harness/config.local.json`의 `git_automation: true` 전환 시점
