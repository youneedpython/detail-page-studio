import { randomUUID } from "node:crypto";
import { AiError, type AiClient } from "../ai/types";
import { estimateCostUsd } from "../cost";
import { sliceForAnalysis, validateUploads, type UploadedImage } from "../image";
import { analysisSystemPrompt, buildAnalysisContent, type ProductContext } from "./prompt";
import { analysisOutputSchema, type AnalysisReport } from "./schema";

export interface AnalysisInput extends ProductContext { images: UploadedImage[] }
export interface AnalysisDependencies { ai: AiClient; now?: () => Date }

export async function analyzeDetailPage(input: AnalysisInput, deps: AnalysisDependencies): Promise<AnalysisReport> {
  // Configuration errors are server errors, not invalid uploads (TASK-004 R-102).
  const configured = process.env.AI_MAX_SLICES_PER_ANALYSIS?.trim();
  if (configured && (!Number.isSafeInteger(Number(configured)) || Number(configured) <= 0)) {
    throw new Error("Invalid analysis slice limit");
  }
  await validateUploads(input.images);
  const slices = await sliceForAnalysis(input.images);
  const result = await deps.ai.generateStructured({ system: analysisSystemPrompt,
    content: buildAnalysisContent(slices, input), schema: analysisOutputSchema, effort: "high" });
  const parsed = analysisOutputSchema.safeParse(result.data);
  if (!parsed.success) throw new AiError("AI_INVALID_OUTPUT");
  return { ...parsed.data, id: randomUUID(), createdAt: (deps.now?.() ?? new Date()).toISOString(),
    sections: parsed.data.sections.map(({ sliceIndex, ...section }) => {
      const slice = slices[Math.min(slices.length - 1, Math.max(0, sliceIndex))];
      return { ...section, sourceSlice: { index: slice.index, top: slice.top, bottom: slice.bottom } };
    }), usage: { ...result.usage, estimatedCostUsd: estimateCostUsd(result.usage) } };
}
