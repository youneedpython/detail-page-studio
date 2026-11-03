import { apiErrorResponse as analyzeErrorResponse } from "../http/errors";
export { apiErrorResponse as analyzeErrorResponse } from "../http/errors";
import { ImageError, type UploadedImage } from "../image";
import { analyzeDetailPage, type AnalysisDependencies } from "./engine";

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
