import { z } from "zod";

export const sectionRoles = ["hook", "problem", "solution", "differentiator", "proof", "spec", "usage", "review", "shipping", "cta", "other"] as const;
export const visualKinds = ["model", "product_cutout", "lifestyle", "detail_closeup", "infographic", "comparison", "certificate", "review_capture", "other"] as const;
export const checklistItems = ["대표 혜택 한 줄", "타깃 명확성", "사용 장면", "차별점", "객관적 근거", "상세 스펙", "사용법 · 관리", "후기 · 사회적 증거", "배송 · 교환 안내", "구매 유도"] as const;
export const scoreCriteria = ["첫 화면 후킹", "스토리 흐름", "차별점 전달", "신뢰 근거", "정보 완결성", "가독성 · 시각 구성"] as const;

export const analysisOutputSchema = z.object({
  summary: z.string(), target: z.string(), tone: z.string(),
  sections: z.array(z.object({
    order: z.number().int().nonnegative(), role: z.enum(sectionRoles), title: z.string(),
    keyCopy: z.array(z.string()), copyPattern: z.string(), appealPoints: z.array(z.string()),
    visuals: z.array(z.object({ kind: z.enum(visualKinds), composition: z.string(), purpose: z.string() })),
    myImageGuide: z.string(), sliceIndex: z.number().int(),
  })),
  checklist: z.array(z.object({ item: z.enum(checklistItems), present: z.boolean(), note: z.string() })).length(10)
    .refine(items => new Set(items.map(item => item.item)).size === 10, "체크리스트 항목은 중복될 수 없습니다."),
  scores: z.array(z.object({ criterion: z.enum(scoreCriteria), score: z.number().int().min(0).max(10), max: z.literal(10), reason: z.string() })).length(6)
    .refine(items => new Set(items.map(item => item.criterion)).size === 6, "점수 항목은 중복될 수 없습니다."),
  suggestions: z.array(z.string()).min(3).max(7),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
export type AnalysisReport = Omit<AnalysisOutput, "sections"> & {
  id: string; createdAt: string;
  sections: Array<Omit<AnalysisOutput["sections"][number], "sliceIndex"> & {
    sourceSlice: { index: number; top: number; bottom: number };
  }>;
  usage: { input: number; output: number; estimatedCostUsd: number };
};
