import { createAiClient } from "../../../lib/ai";
import { analyzeErrorResponse, createAnalyzeHandler } from "../../../lib/analysis/handler";
import { sampleAnalysisResponder } from "../../../lib/analysis/sample";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    return await createAnalyzeHandler({ ai: createAiClient(process.env.AI_CLIENT === "fake" ? sampleAnalysisResponder : []) })(request);
  } catch (error) { return analyzeErrorResponse(error); }
}
