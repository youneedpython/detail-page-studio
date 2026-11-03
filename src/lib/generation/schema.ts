import { z } from "zod";
import { analysisOutputSchema, sectionRoles } from "../analysis/schema";

export const templates = ["hero", "image-text", "feature-list", "spec-table", "notice", "cta"] as const;
export const generateRequestSchema = z.object({
  product: z.object({ name: z.string().trim().min(1).max(60), features: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
    target: z.string().max(100).optional(), priceRange: z.string().max(50).optional() }),
  myImages: z.array(z.object({ index: z.number().int(), description: z.string().max(200) })).max(20),
  referenceReport: analysisOutputSchema.pick({ tone: true, target: true }).extend({
    sections: z.array(analysisOutputSchema.shape.sections.element.omit({ sliceIndex: true }).extend({
      sourceSlice: z.object({ index: z.number().int(), top: z.number(), bottom: z.number() }),
    })),
  }).optional(),
});
export const draftOutputSchema = z.object({ sections: z.array(z.object({
  role: z.enum(sectionRoles), template: z.enum(templates), headline: z.string(), body: z.string(),
  bullets: z.array(z.string()), imageSlot: z.number().int().nullable(), imageGuide: z.string(),
})).min(5).max(10) });
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type DraftOutput = z.infer<typeof draftOutputSchema>;
export type DetailDraft = { id: string; sections: Array<DraftOutput["sections"][number] & { id: string }>;
  usage: { input: number; output: number; estimatedCostUsd: number }; warnings: string[] };
