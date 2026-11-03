# TASK-003 — AiClient / Fake / Anthropic 구현 / 비용 Guard

## 목적

분석 / 생성 엔진이 실제 API 없이도 Test되도록 AI 호출 경계를 고정하고, 운영용 Anthropic 구현과 월 비용 상한 Guard를 만든다(DEC-004, docs/04-ARCHITECTURE.md 2절).

## 선행 조건

- TASK-002 완료
- Claude 세션이 `@anthropic-ai/sdk` 1.4.0, `zod` 4.6.7을 Task Branch에 먼저 설치 / Commit했다. Executor는 Dependency를 추가 / 변경하지 않는다.

## 범위

1. `src/lib/ai/types.ts`
   - `AiClient` 인터페이스: `generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>`
   - `StructuredRequest<T>`: `system: string`, `content: AiContent[]`, `schema: z.ZodType<T>`, `maxTokens?: number`, `effort?: 'low' | 'medium' | 'high'`
   - `AiContent`: `{ type: 'text'; text: string }` 또는 `{ type: 'image'; mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; base64: string }`
   - `StructuredResult<T>`: `{ data: T; usage: AiUsage }`, `AiUsage`는 `{ input: number; output: number }` (입력 / 출력 토큰 수)
   - 오류 클래스 `AiError` (`code`: `AI_UNAVAILABLE` | `AI_TIMEOUT` | `AI_REFUSED` | `AI_INVALID_OUTPUT` | `BUDGET_EXCEEDED`)
2. `src/lib/ai/anthropic-client.ts` — 운영 구현
   - `import Anthropic from "@anthropic-ai/sdk"`, `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"`
   - 모델 `claude-opus-5-5` (상수 `AI_MODEL`). `client.messages.parse({ model, max_tokens, system, messages, output_config: { format: zodOutputFormat(schema), effort } })`
   - `thinking`, `temperature`, `budget_tokens`를 보내지 않는다(이 모델에서 400). 기본 effort는 `medium`.
   - 이미지는 `{ type: "image", source: { type: "base64", media_type, data } }` 블록으로 보낸다.
   - `stop_reason === "refusal"` → `AiError('AI_REFUSED')`, `parsed_output`이 null → `AiError('AI_INVALID_OUTPUT')`
   - SDK 오류는 SDK 타입 클래스로 구분한다: `Anthropic.APIConnectionTimeoutError` → `AI_TIMEOUT`, `Anthropic.RateLimitError` / `Anthropic.InternalServerError` / `Anthropic.APIConnectionError` → `AI_UNAVAILABLE`. 문자열 매칭 금지.
   - API Key는 생성자에서 직접 받지 않고 SDK 기본 환경변수(`ANTHROPIC_API_KEY`)를 사용한다.
3. `src/lib/ai/fake-client.ts` — Test / verify용
   - 생성 시 응답 큐 또는 응답 함수를 받는다. 받은 요청을 `calls` 배열에 기록한다. 응답을 `schema.parse`로 검증해 실제 구현과 같은 계약을 지킨다.
   - 지정 시 `AiError`를 던질 수 있다.
4. `src/lib/cost/` — 비용 Guard
   - 가격 상수: 입력 $4 / 출력 $20 (1M 토큰당, `claude-opus-5-5`)
   - `estimateCostUsd(usage)`
   - `BudgetGuard`: 월(`YYYY-MM`, UTC) 누적 사용액을 저장소 인터페이스(`UsageStore`)에 기록. `assertAvailable()`은 누적액 ≥ 상한이면 `AiError('BUDGET_EXCEEDED')`. `record(usage)`로 누적.
   - `UsageStore` 구현 2개: 메모리(Test), JSON 파일(`.data/usage.json`, Git 비추적)
   - 상한은 `AI_MONTHLY_BUDGET_USD`(기본 30)에서 읽는다.
5. `src/lib/ai/index.ts` — `createAiClient()`: `AI_CLIENT=fake`이면 Fake, 아니면 Anthropic. 비용 Guard로 감싼 `GuardedAiClient`를 반환한다(호출 전 `assertAvailable`, 호출 후 `record`).
6. Test (Vitest, 실제 네트워크 호출 금지)
   - Fake: 응답 / schema 검증 실패 / 오류 전달
   - Anthropic 구현: SDK client를 생성자 주입 가능하게 만들고 가짜 `messages.parse`로 요청 형태(모델, output_config, 이미지 블록, thinking 미전송)와 오류 매핑을 검증
   - 비용: 가격 계산, 월 경계, 상한 초과 차단, 파일 저장소 읽기 / 쓰기(임시 디렉터리)
7. `.env.example`은 Claude 세션이 갱신했다. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- 분석 / 생성 Prompt와 API Route (TASK-005, 007)
- 실제 API 호출 테스트, 이미지 분할

## 완료 조건

- `bash scripts/verify.sh` 성공
- `src/lib/ai` 밖에서 `@anthropic-ai/sdk`를 import하지 않음
- Test가 네트워크 없이 통과

## 작성 주의 (Harness Secret Guard)

- Orchestrator Guard는 이름에 token / key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄을 Secret 할당으로 보고 차단한다. 객체 Key / 변수 / 매개변수 이름에 이 단어를 넣지 않는다. 토큰 수 필드는 input / output으로 쓰고, SDK의 API Key 옵션은 사용하지 않는다(SDK 기본 환경변수 사용).
- SDK 응답 필드(`response.usage.input_tokens`)를 값 위치에서 읽는 것은 허용된다.
