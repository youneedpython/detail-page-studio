# 05. API Spec

상태: `Draft (TASK-001, Human 승인 대기)`. 변경은 Human Approval 대상이다.

## POST `/api/analyze`

- 요청: `multipart/form-data`
  - `images`: 1 ~ 10개, JPG / PNG / WEBP, 파일당 최대 20MB, 업로드 순서 = 페이지 위→아래
  - `productName`, `price`, `category`: 선택
- 응답 200: `AnalysisReport`
- 오류: 400 `INVALID_IMAGE`, 413 `TOO_LARGE`, 429 `BUDGET_EXCEEDED`, 502 `AI_UNAVAILABLE`, 504 `AI_TIMEOUT`

```ts
type SectionRole =
  | 'hook' | 'problem' | 'solution' | 'differentiator' | 'proof'
  | 'spec' | 'usage' | 'review' | 'shipping' | 'cta' | 'other';

interface AnalysisReport {
  id: string;
  createdAt: string;            // ISO 8601
  summary: string;              // 전체 요약 (한국어)
  target: string;               // 추정 타깃
  tone: string;                 // 톤 / 무드
  sections: Array<{
    order: number;
    role: SectionRole;
    title: string;
    keyCopy: string[];          // 핵심 문구 (OCR)
    appealPoints: string[];     // 소구 포인트
    sourceSlice: { index: number; top: number; bottom: number }; // 원본 위치(px)
  }>;
  checklist: Array<{ item: string; present: boolean; note: string }>;
  scores: Array<{ criterion: string; score: number; max: number; reason: string }>;
  suggestions: string[];
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}
```

## POST `/api/generate`

- 요청: `application/json`

```ts
interface GenerateRequest {
  product: { name: string; features: string[]; target?: string; priceRange?: string };
  imageCount: number;           // 업로드한 상품 사진 수 (사진 자체는 브라우저에 보관)
  referenceReport?: Pick<AnalysisReport, 'sections' | 'tone' | 'target'>;
}
```

- 응답 200: `DetailDraft`

```ts
interface DetailDraft {
  id: string;
  sections: Array<{
    id: string;
    role: SectionRole;
    template: string;           // components/templates 키
    headline: string;
    body: string;
    bullets: string[];
    imageSlot: number | null;   // 상품 사진 index
  }>;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}
```

- 오류: 400 `INVALID_REQUEST`, 429 `BUDGET_EXCEEDED`, 502 / 504 동일

## 공통 오류 형식

```json
{ "error": { "code": "BUDGET_EXCEEDED", "message": "이번 달 AI 사용 한도에 도달했습니다." } }
```
