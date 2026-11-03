import { apiErrorResponse } from "../http/errors";
import { generateDraft, type GenerationDependencies } from "./engine";
import { generateRequestSchema } from "./schema";

export function createGenerateHandler(deps: GenerationDependencies): (request: Request) => Promise<Response> {
  return async request => {
    let body: unknown;
    try { body = await request.json(); }
    catch { return invalidRequest(); }
    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) return invalidRequest();
    try { return Response.json(await generateDraft(parsed.data, deps)); }
    catch (error) { return apiErrorResponse(error); }
  };
}
function invalidRequest(): Response {
  return Response.json({ error: { code: "INVALID_REQUEST", message: "상품 정보와 내 사진 목록의 입력 형식을 확인해 주세요." } }, { status: 400 });
}
