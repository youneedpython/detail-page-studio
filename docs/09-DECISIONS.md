# 09. Decisions

승인된 제품 · 기술 · 아키텍처 결정의 최종 기록이다. 상태는 `Human Approved` / `PENDING` / `Rejected` / `Superseded`를 사용한다. 다음 번호: **DEC-009**

---

## DEC-001 — Multi-Agent Harness 도입

- 상태: `Human Approved (Human 지시 2026-11-03)`
- 결정: MoodFit v3의 Harness(Orchestrator / Schema / Prompt / Policy)를 이식한다. Codex = Executor, Claude = Read-only Reviewer, Human = Gate.
- 변경점: AWS Profile Preflight 제거, Git 자동화는 `git_automation` 설정으로만 활성화, PR Required Check는 `verify` 1개.
- 근거 문서: `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md`, `docs/12-ORCHESTRATOR-DESIGN.md`

---

## DEC-002 — 기술 스택 (Gate A)

- 상태: `Human Approved (2026-11-03)`
- 결정:

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

- 상태: `Human Approved (2026-11-03)` — 1단계 캡처 업로드, 2단계 커머스 API, 서버 크롤링 제외
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

- 상태: `Human Approved (2026-11-03)`
- 결정:
  - 월 비용 상한: Human이 금액을 정하지 않았으므로 기본값 `AI_MONTHLY_BUDGET_USD=30`으로 시작한다. `.env.local`에서 언제든 바꿀 수 있다.
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

- 상태: `Human Approved (2026-11-03)` — Ruleset 적용, `git_automation: true`, Repository Public 유지(이미지는 DEC-007로 비공개)
- 완료: Human이 `youneedpython/detail-page-studio`(Public)를 생성했다. 2026-11-03 첫 Commit을 `main`에 Push했다.
- 권장안:
  - `main` Ruleset: 삭제 금지 / Force Push 금지 / Linear History / PR 필수(approvals 0) / Required check `verify` / Squash Merge만 허용 / Bypass 없음
  - `git_automation: true` 전환은 TASK-002 첫 Orchestrator Run이 수동 Git으로 한 번 성공한 뒤로 미룬다.
- 확인 필요: Repository가 **Public**이다. 코드 / 문서에 Secret은 없지만, 분석 프롬프트 등 사업 아이디어가 공개된다. Private 전환 여부를 Human이 결정한다.

---

## DEC-006 — 분석 대상 순서

- 상태: `Human Approved (Human 결정 2026-11-03)`
- 결정: 1단계 남의 스토어(경쟁 상품) 분석 → 2단계 내 스토어 분석. 2단계는 1단계의 분석 기준과 엔진을 재사용한다.

---

## DEC-007 — 분석 자료와 제작 결과물의 사용 원칙

- 상태: `Human Approved (Human 결정 2026-11-03)`
- 결정:
  - 다른 판매자의 상세페이지는 **분석 용도로만** 사용한다. 분석 대상은 페이지 문구(OCR)와 이미지(종류 / 구도 / 전달 목적)다.
  - 상세페이지 제작에는 **사용자 본인의 이미지만** 사용한다. 분석한 캡처 이미지는 제작 결과물에 들어가지 않는다.
  - **실제 상품 이미지, 경쟁 캡처, 생성 결과물 이미지는 GitHub에 올리지 않는다** (Human 결정 2026-11-03). 로컬 보관 위치는 Git 비추적 `private/`이다.
- 구현 원칙 (권장, Human 확인 대기):
  - 업로드한 경쟁 캡처는 분석 후 서버에 저장하지 않는다. 리포트에는 원본 위치 좌표만 남기고, 리포트 화면의 원본 이미지는 브라우저 메모리에서만 표시한다.
  - 생성 문구는 분석 리포트의 구조 / 전개 방식 / 소구 전략만 참고하고, 경쟁 페이지 문구를 그대로 옮기지 않는다. 서버에서 리포트 `keyCopy`와 생성 문구의 긴 공통 구간을 검사해 걸리면 다시 생성한다.
  - 내 사진은 브라우저에 보관하고 서버에는 설명만 보낸다. 섹션에 맞는 사진이 없으면 촬영 가이드를 보여 준다.
  - Test Fixture와 화면 검토 캡처(`docs/images/`)에는 직접 만든 가상 이미지 / 더미 상품만 사용한다.
  - `.gitignore`가 `private/`와 업로드 / 내보내기 산출 폴더를 제외한다. 이미지 파일은 `public/`(앱 아이콘 / UI 에셋), `docs/images/`(가상 데이터 캡처), Fixture 폴더(가상 이미지)에만 Commit할 수 있다.

---

## DEC-008 — Merge 권한 위임

- 상태: `Human Approved (Human 지시 2026-11-03)`
- 결정: Human이 "push 후 merge까지 진행, 별도 승인 받지 않도록"을 지시했다. Claude Code 세션이 Human을 대신해 다음을 수행한다.
  - Task Branch Push, PR 생성 / Ready 전환, **Squash Merge**
  - Gate A / B / C 등 Task 진행에 필요한 결정(패키지 Version, 분석 점수 기준 초안 등)을 권장안대로 확정하고 `docs/09-DECISIONS.md`에 근거와 함께 기록
- Merge 조건(모두 충족해야 함):
  - Remote CI `verify` 성공
  - Orchestrator Task는 Deterministic Verification 성공 + Executor DONE + Claude Reviewer PASS
  - 문서 Task는 `git diff --check`와 Contract / Schema 검증 성공
- 유지하는 금지: Force Push / History Rewrite / `main` 직접 Push / Ruleset Bypass / Auto Merge. Codex Executor와 Orchestrator Script는 여전히 Merge하지 않는다.
- 예외(여전히 Human 확인): 비용이 드는 외부 Resource 생성(배포 등), 유료 API 비용 상한 인상, Repository 공개 범위 변경, Secret 값 입력.

---

## DEC-002 부속 — TASK-002 설치 Version (Gate C, DEC-008에 따라 Claude 세션 결정)

- 상태: `Approved (Claude 세션, 2026-11-03)`
- dependencies: next 16.4.4, react 19.3.1, react-dom 19.3.1
- devDependencies: typescript 6.0.3, @types/node 24.19.2, @types/react 19.3.0, @types/react-dom 19.3.0, eslint 10.14.0, eslint-config-next 16.4.4, tailwindcss 4.3.4, @tailwindcss/postcss 4.3.4, vitest 5.1.0, @vitejs/plugin-react 6.2.1, jsdom 30.1.3, @testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1
- 판단: TypeScript는 최신 7.0.2 대신 6.0.3을 선택했다. 7.x는 새 네이티브 컴파일러라 Next.js / ESLint 도구와의 호환을 아직 확인하지 않았다. @types/node는 런타임(Node 24)에 맞춰 24.x를 선택했다.
- `npm audit`: 개발 의존성에서 moderate 15건이 보고되었다. 런타임 노출이 없는 도구 계층이며 `--force` 수정은 Major 변경을 유발하므로 보류하고 후속 Task에서 재확인한다.
- TASK-002 Executor 확인: 승인된 `package.json`과 `package-lock.json`의 직접 의존성 Version이 모두 일치한다. Dependency와 Lockfile은 변경하지 않았으며, 실제 설치와 앱 검증은 Orchestrator 실행 결과로 확인한다.
