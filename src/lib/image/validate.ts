import sharp from "sharp";
import { ImageError, type UploadedImage } from "./types";

const formats = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
]);
const maxBytes = 20 * 1024 * 1024;

export async function validateUploads(images: UploadedImage[]): Promise<void> {
  if (images.length === 0) throw new ImageError("INVALID_IMAGE", "이미지를 1장 이상 업로드해 주세요.");
  if (images.length > 10) throw new ImageError("TOO_LARGE", "이미지는 최대 10장까지 업로드할 수 있습니다.");
  for (const image of images) {
    if (!formats.has(image.mimeType)) {
      throw new ImageError("INVALID_IMAGE", "JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.");
    }
    if (image.size > maxBytes || image.data.length > maxBytes) {
      throw new ImageError("TOO_LARGE", "이미지 한 장의 크기는 20MB 이하여야 합니다.");
    }
    try {
      const metadata = await sharp(image.data).metadata();
      if (metadata.format !== formats.get(image.mimeType) || !metadata.width || !metadata.height) {
        throw new Error("Invalid format");
      }
      if (metadata.width < 300) {
        throw new ImageError("INVALID_IMAGE", "이미지 너비가 300px 미만입니다. 상세페이지 전체 캡처인지 확인해 주세요.");
      }
      // metadata alone can accept a header with corrupt or missing pixel data.
      await sharp(image.data).stats();
    } catch (error) {
      if (error instanceof ImageError) throw error;
      throw new ImageError("INVALID_IMAGE", "이미지를 읽을 수 없습니다. 올바른 JPG, PNG, WEBP 파일인지 확인해 주세요.");
    }
  }
}
