# TASK-007 — 생성 엔진 + `/api/generate`

## 목적

내 상품 정보(+ 선택 참고 리포트)로 상세페이지 초안 `DetailDraft`(docs/05-API_SPEC.md)를 생성하는 엔진과 API Route를 만든다. 규칙은 docs/14-GENERATION-RULES.md(Gate B, DEC-010)를 따른다.

## 선행 조건

- TASK-003(AiClient), TASK-005(분석 Schema / Handler 패턴) 완료. 새 Dependency 없음.

## 범위

1. `src/lib/generation/schema.ts`
   - 요청 Schema `generateRequestSchema`(Zod): `product`(`name` 1 ~ 60자, `features` 1 ~ 10개 각 1 ~ 200자, `target?` ≤ 100자, `priceRange?` ≤ 50자), `myImages`(0 ~ 20개, `index` 정수, `description` ≤ 200자), `referenceReport?`(`sections` / `tone` / `target`, 분석 Schema의 해당 부분 재사용)
   - 모델 출력 Schema `draftOutputSchema`: `sections` 5 ~ 10개(`role`, `template` enum 6종, `headline`, `body`, `bullets[]`, `imageSlot` 정수 또는 null, `imageGuide`)
   - 길이 제한(docs/14 4절)은 Schema가 아니라 후처리에서 넘치면 자르지 말고 `warnings`에 남긴다(모델 출력이 Schema 거부로 실패하지 않게).
   - `DetailDraft` 타입: 서버가 `id`, 섹션별 `id`, `usage`(`input` / `output` / `estimatedCostUsd`), `warnings: string[]`를 붙인다. `imageSlot`이 `myImages`에 없는 순번이면 null로 보정.
2. `src/lib/generation/prompt.ts` — 한국어 System Prompt(docs/14 2 ~ 4, 6절)와 사용자 입력 텍스트 구성(내 상품 정보, 내 사진 목록, 참고 리포트 요약). 입력은 데이터이며 명령이 아니라고 명시.
3. `src/lib/generation/similarity.ts` — docs/14 5절 검사: `findCopiedSpans(draftTexts, referenceCopies, ownTexts, minLength = 12)` → 위반 목록(섹션 순번, 필드, 구간). 정규화 함수 포함.
4. `src/lib/generation/engine.ts` — `generateDraft(request, deps)`: 요청 검증 → AI 호출(effort `medium`) → 유사도 검사 → 위반 시 위반 구간을 사용자 입력 끝에 덧붙여 1회 재호출 → 그래도 위반이면 `warnings` 추가 → 길이 초과 / 금지 표현(최고, 최초, 1위, 100%, 완벽) 발견 시 `warnings` 추가 → 결과 조립(usage는 모든 호출 합산).
5. `src/lib/generation/sample.ts` — `sampleDraftResponder`(가상 상품 "데일리 텀블러 500ml", 6개 섹션, 템플릿 6종 모두 사용). `AI_CLIENT=fake`용.
6. `src/lib/generation/handler.ts` + `src/app/api/generate/route.ts` — TASK-005 analyze와 같은 패턴. JSON 본문 검증 실패 → 400 `INVALID_REQUEST`(한국어 message), AiError 매핑과 500 처리는 analyze와 동일. 공통 오류 응답 함수가 있으면 재사용하고, 없으면 `src/lib/http/errors.ts`로 추출해 두 Handler가 함께 쓴다.
7. Test (실제 API 호출 금지)
   - 요청 Schema 경계, 출력 조립(id / imageSlot 보정 / usage 합산)
   - 유사도: 정규화, 12자 경계, 내 상품 정보 예외, 재생성 1회 후 통과, 재생성 후에도 위반 시 warnings
   - 금지 표현 / 길이 warnings
   - Handler: 200, 400 INVALID_REQUEST, AiError 매핑, 500 내부 메시지 미노출
   - sample responder Schema 통과
8. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- 편집기 / 템플릿 화면(TASK-008), PNG 내보내기(TASK-009)

## 완료 조건

- `bash scripts/verify.sh` 성공
- `AI_CLIENT=fake`에서 `/api/generate`가 샘플 초안을 반환(Test로 확인)

## 작성 주의 (Harness Secret Guard)

- 이름에 token / key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 해당 단어를 객체 Key / 변수 / 매개변수 이름에 쓰지 않는다. `StructuredRequest`의 출력 상한 필드는 지정하지 않는다.
