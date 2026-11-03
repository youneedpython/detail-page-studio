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
    copyPattern: string;        // 문구 전개 방식 (예: 질문형 후킹 → 수치 근거)
    appealPoints: string[];     // 소구 포인트
    visuals: Array<{
      kind: 'model' | 'product_cutout' | 'lifestyle' | 'detail_closeup'
          | 'infographic' | 'comparison' | 'certificate' | 'review_capture' | 'other';
      composition: string;      // 구도 / 배치 / 색감
      purpose: string;          // 이 이미지가 전달하려는 메시지
    }>;
    myImageGuide: string;       // 내 상품으로 이 섹션을 만들 때 필요한 사진 촬영 / 준비 가이드
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
  myImages: Array<{ index: number; description: string }>; // 내 사진 목록과 설명 (사진 파일은 브라우저에 보관, 서버로 보내지 않음)
  referenceReport?: Pick<AnalysisReport, 'sections' | 'tone' | 'target'>;
}
```

- 참고 리포트는 **구조 / 전개 방식 / 소구 전략**으로만 사용한다. 생성 문구가 참고 리포트의 `keyCopy`를 그대로 옮기지 않도록 Prompt로 지시하고, 서버에서 유사도 검사(긴 공통 구간 탐지)로 한 번 더 걸러낸다(DEC-007).

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
    imageSlot: number | null;   // myImages index. 맞는 사진이 없으면 null + 촬영 가이드 표시
    imageGuide: string;         // 이 섹션에 어울리는 사진 설명
  }>;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}
```

- 오류: 400 `INVALID_REQUEST`, 429 `BUDGET_EXCEEDED`, 502 / 504 동일

## 공통 오류 형식

```json
{ "error": { "code": "BUDGET_EXCEEDED", "message": "이번 달 AI 사용 한도에 도달했습니다." } }
```
