import { AiError } from "../ai/types";
import { ImageError, type UploadedImage } from "../image";
import { analyzeDetailPage, type AnalysisDependencies } from "./engine";

const aiFailures = {
  BUDGET_EXCEEDED: [429, "이번 달 AI 사용 한도에 도달했습니다."],
  AI_UNAVAILABLE: [502, "AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."],
  AI_INVALID_OUTPUT: [502, "AI 분석 결과를 읽을 수 없습니다. 다시 시도해 주세요."],
  AI_TIMEOUT: [504, "AI 분석 시간이 초과되었습니다. 다시 시도해 주세요."],
  AI_REFUSED: [422, "AI가 이 이미지의 분석을 진행할 수 없습니다."],
} as const;

export function analyzeErrorResponse(error: unknown): Response {
  if (error instanceof ImageError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.code === "TOO_LARGE" ? 413 : 400 });
  if (error instanceof AiError) {
    const [status, message] = aiFailures[error.code];
    return Response.json({ error: { code: error.code, message } }, { status });
  }
  console.error("상세페이지 분석 처리 실패", error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "분석 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } }, { status: 500 });
}

export function createAnalyzeHandler(deps: AnalysisDependencies): (request: Request) => Promise<Response> {
  return async request => {
    try {
      let form: FormData;
      try { form = await request.formData(); }
      catch { throw new ImageError("INVALID_IMAGE", "이미지를 multipart/form-data 형식으로 업로드해 주세요."); }
      const uploads = form.getAll("images");
      if (uploads.some(value => typeof value === "string")) throw new ImageError("INVALID_IMAGE", "이미지 파일을 업로드해 주세요.");
      if (uploads.length > 10) throw new ImageError("TOO_LARGE", "이미지는 최대 10장까지 업로드할 수 있습니다.");
      const images: UploadedImage[] = [];
      for (const upload of uploads) {
        if (typeof upload === "string") continue;
        if (upload.size > 20 * 1024 * 1024) throw new ImageError("TOO_LARGE", "이미지 한 장의 크기는 20MB 이하여야 합니다.");
        images.push({ name: upload.name, mimeType: upload.type, size: upload.size, data: Buffer.from(await upload.arrayBuffer()) });
      }
      const optional = (name: string) => { const value = form.get(name); return typeof value === "string" ? value.slice(0, 100) : undefined; };
      return Response.json(await analyzeDetailPage({ images, productName: optional("productName"), price: optional("price"), category: optional("category") }, deps));
    } catch (error) { return analyzeErrorResponse(error); }
  };
}
