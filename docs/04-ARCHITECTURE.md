# 04. Architecture

상태: `Draft (DEC-002 ~ DEC-004 권장안 기준, Human 승인 대기)`

## 1. 구성

```text
Browser (Next.js 화면)
  ├─ 캡처 업로드 / 편집기 / 미리보기
  ├─ PNG 내보내기 (DOM → 이미지, 브라우저에서 처리)
  └─ 작업 임시 저장 (localStorage)
        │  HTTPS
        ▼
Next.js API Route (서버)
  ├─ /api/analyze   : 이미지 검증 → 세로 분할 → AnalysisEngine
  ├─ /api/generate  : 상품 정보 + 리포트 → CopyEngine
  └─ 비용 Guard     : 요청당 / 월 상한 확인
        │
        ▼
AiClient 인터페이스
  ├─ AnthropicAiClient (운영, @anthropic-ai/sdk, claude-opus-5-5)
  └─ FakeAiClient      (Test / verify, 고정 응답)
```

2단계에서 `CommerceClient`(네이버 커머스 API, 내 상품 `detailContent` 조회)를 추가한다. 서버는 네이버 쇼핑 / 스마트스토어 페이지에 접속하지 않는다(DEC-003).

## 2. 모듈 경계

| 모듈 | 책임 | 비고 |
|---|---|---|
| `lib/image` | 업로드 검증, 세로 분할, 크기 축소 | 순수 함수, 단위 Test |
| `lib/analysis` | 분석 Prompt 구성, 결과 Schema 검증, 섹션 병합 | AiClient에만 의존 |
| `lib/generation` | 섹션 구성안 / 카피 생성 | AiClient에만 의존 |
| `lib/ai` | AiClient 인터페이스, Anthropic 구현, Fake 구현 | SDK 사용은 이 모듈에만 |
| `lib/cost` | 토큰 사용량 기록, 상한 확인 | 1단계는 서버 메모리 / 파일, 저장소 도입 시 교체 |
| `components/templates` | 상세페이지 섹션 템플릿 | 860px 기준 |

## 3. 데이터 형식

- 분석 결과는 JSON Schema(`AnalysisReport`)로 고정하고 Structured Output으로 받는다. 형식은 `docs/05-API_SPEC.md`.
- 생성 결과(`DetailDraft`)는 섹션 배열이며 편집기 상태와 같은 형식을 쓴다.

## 4. Secret / 설정

| 이름 | 위치 | 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.local` / 배포 환경 Secret | 분석 / 생성 |
| `AI_MONTHLY_BUDGET_USD` | `.env.local` | 월 비용 상한 |
| `AI_MAX_SLICES_PER_ANALYSIS` | `.env.local` | 분석 1건당 이미지 조각 상한 |

## 5. 테스트 전략

- verify / CI는 `FakeAiClient`만 사용하고 실제 API를 호출하지 않는다.
- 실제 모델 품질 확인은 Human이 수동으로 실행하는 별도 Script(`npm run eval:analysis`, 후속 Task)로 한다.
- 분석 Fixture는 직접 만든 가상 상세페이지 이미지만 사용한다. 실제 타 스토어 캡처를 Repository에 넣지 않는다.

## 6. 배포

1단계 MVP 완료 후 별도 Gate에서 결정한다(후보: Vercel). 그전까지 로컬 실행만 한다.
