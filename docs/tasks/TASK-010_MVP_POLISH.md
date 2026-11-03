# TASK-010 — 1단계 MVP 정리

## 목적

1단계 흐름(분석 → 초안 생성 → 편집 → PNG 내보내기)을 처음 쓰는 사람이 설정부터 사용까지 막힘없이 쓸 수 있게 정리하고, 이전 Task의 보류 Finding을 처리한다.

## 선행 조건

- TASK-009 완료. 새 Dependency 없음.

## 범위

1. AI 설정 누락 안내 (`AI_NOT_CONFIGURED`)
   - `AI_CLIENT`가 `fake`가 아니고 `ANTHROPIC_API_KEY` 환경변수가 비어 있으면, `/api/analyze`와 `/api/generate`는 AI를 호출하지 않고 **503** `{ error: { code: "AI_NOT_CONFIGURED", message: "AI 연결 설정이 필요합니다. .env.local에 ANTHROPIC_API_KEY를 넣거나 AI_CLIENT=fake로 체험 모드를 사용하세요." } }`를 반환한다.
   - `AiErrorCode`에 `AI_NOT_CONFIGURED`를 추가하고 `src/lib/http/errors.ts` 매핑, `src/lib/client/labels.ts` 오류 안내에 반영한다. 환경변수 값 자체를 응답 / 로그에 넣지 않는다.
   - 확인은 `createAiClient()` 또는 Route 진입부 한 곳에서 한다(두 Route 공통).
2. 체험 모드 표시
   - `AI_CLIENT=fake`일 때 분석 입력 / 상품 정보 입력 화면 상단에 "체험 모드: 실제 AI 대신 예시 결과를 보여 줍니다" 배너. 서버 환경값을 클라이언트에 전달하는 방법은 Server Component에서 읽어 props로 넘기는 방식을 쓴다(`NEXT_PUBLIC_` 변수 추가 금지).
3. 보류 Finding 처리
   - TASK-002 F-003: `vitest.config.ts` → `vitest.config.mts`로 이름 변경(내용 동일). `tsconfig.json` include / ESLint 설정에서 깨지지 않는지 확인.
   - TASK-004 R-101은 처리 완료. TASK-003 R-002 / TASK-004 R-102는 TASK-005에서 처리 완료 — 별도 작업 없음.
4. 홈 화면 사용 흐름 안내
   - 두 진입 버튼 아래에 3단계 안내: ① 경쟁 상세페이지 캡처 업로드 → ② 분석 리포트 확인 → ③ 리포트 구조로 내 상세페이지 만들기 / PNG 내보내기.
5. `README.md` 전면 갱신(사용자 / 개발자 겸용, 한국어)
   - 서비스 소개(1단계 기능), 실행 방법(Node 24, `npm ci`, `.env.local` 설정 표: `ANTHROPIC_API_KEY`, `AI_CLIENT`, `AI_MONTHLY_BUDGET_USD`, `AI_MAX_SLICES_PER_ANALYSIS`), 체험 모드, 사용 순서, 데이터 처리 원칙(업로드 이미지 서버 미저장, 내 사진은 브라우저에만, 결과물 이미지 GitHub 비공개 — DEC-007), 캡처 방법, 비용 안내(월 상한), 검증 명령, Harness 문서 링크, 2단계 예정(내 스토어 커머스 API).
   - 화면 캡처 이미지는 기존 `docs/images/` 경로를 링크한다(새 이미지 추가 없음).
6. Test
   - API 키 없음 + `AI_CLIENT` 미설정 → 두 Route 503 `AI_NOT_CONFIGURED`, `fake`면 200, 키가 있으면 확인을 통과(Anthropic 호출은 Fake로 대체)
   - 응답 본문에 환경변수 값이 포함되지 않음
   - 체험 모드 배너 표시 / 미표시
   - 홈 3단계 안내
7. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- 배포, 로그인, 2단계(커머스 API)

## 완료 조건

- `bash scripts/verify.sh` 성공

## 작성 주의 (Harness Secret Guard)

- 이름에 token / api key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 변수 이름을 `hasCredential`처럼 짓고, README의 `.env.local` 설명은 값 없이 변수 이름만 표에 적는다(이름 뒤에 등호를 붙인 예시 줄을 쓰지 않는다).
