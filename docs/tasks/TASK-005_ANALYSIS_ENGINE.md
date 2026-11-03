# TASK-005 — 분석 엔진 + `/api/analyze`

## 목적

업로드한 상세페이지 캡처를 분석해 `AnalysisReport`(docs/05-API_SPEC.md)를 반환하는 엔진과 API Route를 만든다. 분석 기준은 docs/13-ANALYSIS-CRITERIA.md(Gate B, DEC-009)를 따른다.

## 선행 조건

- TASK-003(AiClient), TASK-004(이미지 검증 / 분할) 완료. 새 Dependency 없음.

## 범위

1. `src/lib/analysis/schema.ts`
   - Zod Schema `analysisOutputSchema`: 모델이 채우는 부분. `summary`, `target`, `tone`, `sections[]`(`order`, `role`, `title`, `keyCopy[]`, `copyPattern`, `appealPoints[]`, `visuals[]`, `myImageGuide`, `sliceIndex`), `checklist[]`, `scores[]`, `suggestions[]`
     - `role` / `visuals.kind`는 docs/13의 enum, `checklist.item`은 docs/13의 10항목 문자열 enum, `scores.criterion`은 6항목 enum, `score`는 0 ~ 10 정수, `max`는 10
     - `sliceIndex`: 섹션이 시작되는 조각 번호(0부터)
   - `AnalysisReport` 타입: docs/05 형식. 서버가 `id`(crypto.randomUUID), `createdAt`(ISO), `usage`(`input` / `output` / `estimatedCostUsd`)를 붙이고, 각 섹션의 `sliceIndex`를 `sourceSlice: { index, top, bottom }`(TASK-004 조각의 원본 좌표)로 바꾼다.
2. `src/lib/analysis/prompt.ts`
   - 한국어 System Prompt: 역할(스마트스토어 상세페이지 분석가), docs/13의 섹션 역할 / 이미지 종류 / 체크리스트 / 점수 기준 / 제안 규칙을 포함
   - 사용자 입력 블록 구성: 선택 입력(상품명 / 가격 / 카테고리) 텍스트 → 각 조각마다 `[조각 n / 전체 N, 이미지 k]` 텍스트 + 이미지 블록을 순서대로
   - 지시: 겹침 구간(조각 사이 80px)은 한 번만 해석, 이미지 안 문구는 원문 그대로 핵심만 `keyCopy`에 담되 문장 전체를 길게 옮기지 않음, 보이지 않는 정보는 추측하지 않음
3. `src/lib/analysis/engine.ts` — `analyzeDetailPage(input, deps)`:
   - `validateUploads` → `sliceForAnalysis` → `ai.generateStructured({ system, content, schema: analysisOutputSchema, effort: 'high' })` (출력 상한은 AnthropicAiClient 기본값 16000을 쓴다) → 결과 조립(`estimateCostUsd` 사용)
   - 모델이 범위 밖 `sliceIndex`를 주면 가장 가까운 유효 조각으로 보정한다.
4. `src/lib/analysis/sample.ts` — `sampleAnalysisResponder`: `AI_CLIENT=fake`일 때 쓰는 고정 샘플 응답(가상 상품 "데일리 텀블러 500ml"). 요청의 조각 수에 맞춰 `sliceIndex`를 만든다. 로컬 화면 개발(TASK-006)용이다.
5. `src/lib/analysis/handler.ts` — `createAnalyzeHandler(deps: { ai: AiClient; now?: () => Date })`가 `(request: Request) => Promise<Response>`를 반환
   - `multipart/form-data`의 `images`(여러 개, 순서 유지), `productName` / `price` / `category`(선택, 각 100자 이하로 자름)
   - 오류 응답 형식 `{ error: { code, message } }`(한국어 message):
     - `ImageError` INVALID_IMAGE → 400, TOO_LARGE → 413
     - `AiError` BUDGET_EXCEEDED → 429, AI_UNAVAILABLE / AI_INVALID_OUTPUT → 502, AI_TIMEOUT → 504, AI_REFUSED → 422
     - 그 밖의 오류(설정 오류, SDK 인증 오류 등) → 500 `INTERNAL_ERROR`, 내부 메시지 / 스택은 응답에 넣지 않고 `console.error`로만 남긴다(TASK-003 R-002, TASK-004 R-102)
   - 업로드 이미지와 조각은 응답 후 보관하지 않는다(DEC-007). 응답에도 조각 이미지는 넣지 않는다.
6. `src/app/api/analyze/route.ts` — `export const runtime = "nodejs"`, `POST`는 `createAnalyzeHandler({ ai: createAiClient(process.env.AI_CLIENT === "fake" ? sampleAnalysisResponder : []) })`를 요청 시점에 만들어 호출
7. Test (실제 API 호출 금지, Test 이미지는 코드로 생성)
   - Prompt / content 구성: 조각 순서, 라벨, 선택 입력 포함, 이미지 블록 수
   - 엔진: Fake 응답 → 리포트 조립(sourceSlice 좌표, usage 비용), 범위 밖 sliceIndex 보정, Schema 불일치 → AI_INVALID_OUTPUT
   - Handler: 정상 200, 각 오류 코드별 HTTP 상태 / 형식, 알 수 없는 오류 500에 내부 메시지 미노출
   - sample responder가 Schema를 통과
8. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- 업로드 / 리포트 화면(TASK-006), 생성 엔진(TASK-007)

## 완료 조건

- `bash scripts/verify.sh` 성공
- `AI_CLIENT=fake`로 `/api/analyze`에 이미지 1장을 보내면 샘플 리포트가 200으로 반환된다(Test로 확인)

## 작성 주의 (Harness Secret Guard)

- 이름에 token / key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 해당 단어를 객체 Key / 변수 / 매개변수 이름에 쓰지 않는다. `StructuredRequest`의 출력 상한 필드는 지정하지 않는다.
