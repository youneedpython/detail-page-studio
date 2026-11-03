# 09. Decisions

승인된 제품 · 기술 · 아키텍처 결정의 최종 기록이다. 상태는 `Human Approved` / `PENDING` / `Rejected` / `Superseded`를 사용한다. 다음 번호: **DEC-007**

---

## DEC-001 — Multi-Agent Harness 도입

- 상태: `Human Approved (Human 지시 2026-11-03)`
- 결정: MoodFit v3의 Harness(Orchestrator / Schema / Prompt / Policy)를 이식한다. Codex = Executor, Claude = Read-only Reviewer, Human = Gate.
- 변경점: AWS Profile Preflight 제거, Git 자동화는 `git_automation` 설정으로만 활성화, PR Required Check는 `verify` 1개.
- 근거 문서: `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md`, `docs/12-ORCHESTRATOR-DESIGN.md`

---

## DEC-002 — 기술 스택 (Gate A)

- 상태: `PENDING (권장안 작성 2026-11-03, Human 승인 대기)`
- 권장안:

| 영역 | 권장 | 이유 |
|---|---|---|
| 언어 | TypeScript | Harness와 같은 Node.js 24 런타임, verify / CI 하나로 통일 |
| 앱 | Next.js (App Router) 단일 앱 | 화면 + API Route를 한 Repository / 한 verify로 관리. 1인 개발 규모에 적합 |
| UI | React + Tailwind CSS | 상세페이지 템플릿(긴 세로 레이아웃)을 빠르게 구성 |
| 이미지 내보내기 | 브라우저에서 DOM → PNG 변환 (html-to-image 계열) | 서버 헤드리스 브라우저 불필요. 1단계 범위에 충분 |
| AI 호출 | Anthropic TypeScript SDK (`@anthropic-ai/sdk`) | DEC-004 |
| 저장 | 1단계: 없음(브라우저 localStorage) → 저장이 필요해지면 SQLite + Prisma | MVP 범위 최소화 |
| Test | Vitest + Testing Library, 외부 API는 Fake | verify에서 실제 API 호출 금지 |
| 패키지 관리 | npm (`package-lock.json`) | MoodFit과 동일 |

- 각 패키지의 정확한 Version은 TASK-002 시작 시 그 시점 최신 안정판을 확인해 고정하고 이 DEC에 기록한다.
- 대안: Frontend(React + Vite) / Backend(Fastify) 분리. 2단계에서 서버 작업(커머스 API, 배치)이 커지면 분리를 재검토한다.

---

## DEC-003 — 상세페이지 데이터 수집 방식

- 상태: `PENDING (권장안 갱신 2026-11-03, Human 승인 대기)`
- 제품 순서 (Human 결정 2026-11-03): 남의 스토어 분석을 먼저 하고, 내 스토어 분석은 그다음에 한다.
- 확인한 사실 (2026-11-03):
  - `smartstore.naver.com/robots.txt`는 `User-agent: *`에 `Disallow: /`이다. Googlebot 등 일부 검색엔진만 허용하고, GPTBot / ClaudeBot 등 AI 크롤러는 명시적으로 차단한다.
  - `shopping.naver.com/robots.txt`는 "AI 크롤링 및 RAG 목적 접근 금지"를 명시한다.
  - 네이버 커머스 API는 **판매자 본인 스토어**용이다. 원상품 조회(`GET /v2/products/origin-products/{originProductNo}`)로 상세 설명(`detailContent`, HTML)을 받을 수 있다. 다른 스토어는 조회할 수 없다.
  - 네이버 검색 API(쇼핑)는 상품명 / 가격 / 링크 / 이미지 목록만 주며 상세 본문은 주지 않는다.
- 판단: 서버가 남의 상세페이지를 가져와 AI로 분석하는 방식(URL 1건이라도)은 robots.txt와 네이버가 명시한 AI 목적 금지에 정면으로 걸린다. 기존 권장안 B(서버의 URL 1건 수집)를 철회한다.
- 선택지:
  - **A. 캡처 업로드**: 사용자가 자기 브라우저로 본 상세페이지를 전체 캡처해 업로드한다. 서버는 네이버에 접속하지 않는다.
  - B. 브라우저 확장 프로그램: 사용자가 보고 있는 페이지에서 이미지 / 텍스트를 사용자 동작으로 추출한다. 서버 크롤링은 아니지만 약관상 회색 지대라 법률 검토 후에만 진행한다.
  - C. 서버 크롤링 (URL 입력 → 서버 수집): 제외.
- 권장안:
  - **1단계(남의 스토어)는 A만 구현한다.** 업로드 화면에 "본인이 열람한 페이지의 캡처만 업로드" 안내를 둔다. 업로드한 원본 이미지는 분석 후 저장하지 않는 것을 기본으로 한다.
  - **2단계(내 스토어)는 커머스 API**로 내 상품의 `detailContent`를 가져와 같은 분석 엔진에 넣는다. 판매자 본인 인증 정보는 서버 환경변수에만 둔다.
  - B는 1단계 사용 결과를 보고 별도 Gate로 다시 판단한다.
- 정리: "크롤링 + API 둘 다"가 아니라 **"캡처 업로드 + 커머스 API"** 조합이 된다.

---

## DEC-004 — 분석 · 생성 AI 모델과 비용 상한

- 상태: `PENDING (권장안 작성 2026-11-03, Human 승인 대기)`
- 권장안:
  - 모델: Claude Opus 5.5 (`claude-opus-5-5`). 입력 $4 / 출력 $20 (1M 토큰당, 2026-10 기준). 이미지(Vision)와 한국어 카피 생성을 하나의 모델로 처리한다.
  - 호출 방식: Anthropic TypeScript SDK, Structured Output으로 분석 결과 JSON Schema 고정, 긴 응답은 Streaming.
  - 긴 세로 캡처는 서버에서 세로로 여러 조각으로 나눠 순서대로 전달한다. 조각 크기 / 개수 상한은 TASK에서 실제 이미지 제한을 확인해 정한다.
  - 비용 상한(초안): 분석 1건당 입력 이미지 조각 최대 N장, 월 사용액 상한을 환경변수로 두고 초과 시 요청을 거부한다. 구체 금액은 Human 결정.
  - API Key: `ANTHROPIC_API_KEY`를 `.env.local`에만 둔다. Agent(Codex / Claude CLI)의 구독 로그인과 분리한다.
  - Test: SDK 호출부를 인터페이스로 감싸고 verify에서는 Fake 응답을 사용한다.
- 대안: 비용을 낮추려면 조각별 OCR / 1차 분류는 저가 모델(`claude-haiku-5-5`), 종합 분석 / 카피는 Opus 5.5로 나누는 2단 구성. 실제 결과 품질을 비교한 뒤 결정한다.
- 이미지 생성 모델: 1단계 제외. 상품 이미지는 사용자가 올린 사진을 템플릿에 배치한다.

---

## DEC-005 — GitHub Remote / Branch Ruleset / Git 자동화

- 상태: `PENDING (Remote 생성 완료, Ruleset / 자동화 Human 승인 대기)`
- 완료: Human이 `youneedpython/detail-page-studio`(Public)를 생성했다. 2026-11-03 첫 Commit을 `main`에 Push했다.
- 권장안:
  - `main` Ruleset: 삭제 금지 / Force Push 금지 / Linear History / PR 필수(approvals 0) / Required check `verify` / Squash Merge만 허용 / Bypass 없음
  - `git_automation: true` 전환은 TASK-002 첫 Orchestrator Run이 수동 Git으로 한 번 성공한 뒤로 미룬다.
- 확인 필요: Repository가 **Public**이다. 코드 / 문서에 Secret은 없지만, 분석 프롬프트 등 사업 아이디어가 공개된다. Private 전환 여부를 Human이 결정한다.

---

## DEC-006 — 분석 대상 순서

- 상태: `Human Approved (Human 결정 2026-11-03)`
- 결정: 1단계 남의 스토어(경쟁 상품) 분석 → 2단계 내 스토어 분석. 2단계는 1단계의 분석 기준과 엔진을 재사용한다.
