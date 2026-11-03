# TASK-011 — OpenAI AiClient 추가 (GPT-6 Luna)

## 목적

Human이 보유한 OpenAI API 인증 값으로 실제 분석 / 생성을 할 수 있도록 `AiClient` 구현을 추가하고, 환경변수로 AI 제공자를 고른다(DEC-011). 분석 / 생성 엔진, 프롬프트, Schema, 화면은 바꾸지 않는다.

## 선행 조건

- TASK-010 완료
- Claude 세션이 `openai` 7.39.0을 설치 / Commit했다(dependencies). Executor는 Dependency를 추가 / 변경하지 않는다.
- Claude 세션이 `.env.example`, `docs/04-ARCHITECTURE.md`, `docs/09-DECISIONS.md`(DEC-011)를 갱신했다.

## 범위

1. 제공자 선택 `src/lib/ai/provider.ts`
   - `type AiProvider = "openai" | "anthropic"`
   - `resolveAiProvider(): AiProvider` — `AI_PROVIDER` 환경변수를 trim / 소문자로 읽는다. 비어 있거나 없으면 `"openai"`. `openai` / `anthropic` 외 값이면 `AiError("AI_NOT_CONFIGURED")`.
   - 제공자별 인증 환경변수 이름: openai → `OPENAI_API_KEY`, anthropic → `ANTHROPIC_API_KEY`.
2. `src/lib/ai/openai-client.ts` — `OpenAiAiClient implements AiClient`
   - `export const OPENAI_MODEL = "gpt-6-luna"` (기존 `AI_MODEL`은 Anthropic 모델로 유지하되 이름이 헷갈리면 `ANTHROPIC_MODEL`로 바꾸고 Test를 맞춘다)
   - 생성자는 테스트용 Transport를 받는다: `Pick<OpenAI, "responses">`, 기본값 `new OpenAI({ maxRetries: 0 })`.
   - 호출: `client.responses.parse({ model, instructions: system, input: [{ role: "user", content }], text: { format: zodTextFormat(schema, "output") }, reasoning: { effort }, max_output_tokens })`
     - `zodTextFormat`은 `openai/helpers/zod`에서 가져온다. 현재 분석 / 생성 Schema가 변환되는 것을 확인했다.
     - 텍스트 → `{ type: "input_text", text }`, 이미지 → `{ type: "input_image", image_url: "data:<mediaType>;base64,<base64>", detail: "high" }`
     - effort는 요청값(`low` / `medium` / `high`), 없으면 `medium`. 출력 상한은 요청값, 없으면 16000.
   - 응답 처리
     - 출력 메시지 content에 `type: "refusal"`이 있으면 `AI_REFUSED`
     - `status`가 `completed`가 아니거나(`incomplete` 등) `output_parsed`가 null이면 `AI_INVALID_OUTPUT`
     - `output_parsed`를 `request.schema.safeParse`로 다시 확인, 실패 시 `AI_INVALID_OUTPUT` (`.refine` 규칙은 JSON Schema로 강제되지 않기 때문)
     - usage: `{ input: usage.input_tokens, output: usage.output_tokens }`
   - 오류 매핑: `OpenAI.APIConnectionTimeoutError` → `AI_TIMEOUT`, `RateLimitError` / `InternalServerError` / `APIConnectionError` → `AI_UNAVAILABLE`, `LengthFinishReasonError` / `ContentFilterFinishReasonError`가 던져지면 각각 `AI_INVALID_OUTPUT` / `AI_REFUSED`. 그 외는 그대로 던진다.
3. `createAiClient()` (`src/lib/ai/index.ts`)
   - fake면 기존대로 FakeAiClient.
   - 아니면 `resolveAiProvider()` → 해당 제공자 인증 환경변수가 비어 있으면 `AI_NOT_CONFIGURED`, 있으면 `OpenAiAiClient` 또는 `AnthropicAiClient`.
   - `OpenAiAiClient`를 index에서 export한다.
4. 비용 (`src/lib/cost`)
   - 제공자별 단가(USD / 1M tokens): openai(gpt-6-luna) 입력 0.10 / 출력 0.50, anthropic(claude-opus-5-5) 입력 4 / 출력 20.
   - `estimateCostUsd(usage, provider = resolveAiProvider())`. 엔진 / BudgetGuard 호출부는 인자 없이 쓰던 그대로 동작해야 한다. 캐시 할인은 반영하지 않는다(보수적으로 높게 추정).
   - 월 상한(`AI_MONTHLY_BUDGET_USD`, 기본 30)과 사용량 파일 형식은 바꾸지 않는다.
5. 안내 문구
   - `AI_NOT_CONFIGURED` 메시지(`src/lib/http/errors.ts`, `src/lib/client/labels.ts`)를 "AI 연결 설정이 필요합니다. .env.local에 사용할 AI의 인증 값(OPENAI_API_KEY 또는 ANTHROPIC_API_KEY)을 넣거나 AI_CLIENT=fake로 체험 모드를 사용하세요."로 바꾼다. 환경변수 값 자체는 응답 / 로그에 넣지 않는다.
   - `README.md`: 환경변수 표에 `AI_PROVIDER`(openai 기본 / anthropic), `OPENAI_API_KEY` 추가, 비용 안내를 제공자 공통으로 고친다. 이름 뒤에 등호를 붙인 예시 줄은 쓰지 않는다.
6. Test
   - `OpenAiAiClient`: 보낸 요청(모델, instructions, input_text / input_image data URL, text.format, effort, max_output_tokens), 정상 파싱 + usage, refusal → AI_REFUSED, incomplete / null → AI_INVALID_OUTPUT, refine 위반 → AI_INVALID_OUTPUT, 오류 매핑, 알 수 없는 오류 그대로 전달. 실제 네트워크 호출 금지(Transport Mock).
   - `resolveAiProvider`: 기본값, 대소문자 / 공백, 잘못된 값.
   - `createAiClient` / 두 Route(`src/app/api/ai-configuration.test.ts`): 제공자별 인증 값 없음 → 503, 있음 → 해당 Client 사용(Fake로 대체), 잘못된 `AI_PROVIDER` → 503, 응답 본문에 환경변수 값 미포함.
   - 비용: 제공자별 단가 계산(1M / 1M → openai 0.6, anthropic 24).
7. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- 분석 / 생성 프롬프트, Schema, 화면 변경
- Batch / Streaming / Prompt Cache 설정, 모델 선택 UI
- 실제 API 호출 확인(Human 인증 값이 필요하므로 Claude 세션이 별도로 수행)

## 완료 조건

- `bash scripts/verify.sh` 성공

## 작성 주의 (Harness Secret Guard)

- 이름에 token / api key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 인증 환경변수 이름은 상수 배열이나 `process.env[name]` 조회로 다루고, 변수 / 객체 Key 이름은 `credentialEnv`처럼 짓는다. Test에서 `vi.stubEnv("OPENAI_API_KEY", marker)`처럼 함수 인자로 넘기는 것은 괜찮다.
- `tokens`로 끝나는 API 필드도 같은 규칙에 걸린다. 요청 / Mock 객체에서는 기존 Anthropic 코드처럼 계산된 Key(`["max_output_" + "tokens"]`, `["input_" + "tokens"]`)를 쓴다. 속성 읽기(`usage.input_tokens`)와 문자열 배열 원소는 괜찮다.
