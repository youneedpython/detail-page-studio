import { createAiClient } from "../../../lib/ai";
import { createGenerateHandler } from "../../../lib/generation/handler";
import { sampleDraftResponder } from "../../../lib/generation/sample";
import { apiErrorResponse } from "../../../lib/http/errors";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try {
    return await createGenerateHandler({ ai: createAiClient(process.env.AI_CLIENT === "fake" ? sampleDraftResponder : []) })(request);
  } catch (error) { return apiErrorResponse(error); }
}
