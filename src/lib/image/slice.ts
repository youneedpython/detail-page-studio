import sharp from "sharp";
import { ImageError, type AnalysisSlice, type SliceOptions, type UploadedImage } from "./types";
import { validateUploads } from "./validate";

export async function sliceForAnalysis(images: UploadedImage[], options: SliceOptions = {}): Promise<AnalysisSlice[]> {
  const targetWidth = options.targetWidth ?? 860;
  const sliceHeight = options.sliceHeight ?? 1400;
  const overlap = options.overlap ?? 80;
  const quality = options.quality ?? 85;
  const configuredMax = process.env.AI_MAX_SLICES_PER_ANALYSIS?.trim();
  const maxSlices = options.maxSlices ?? (configuredMax ? Number(configuredMax) : 24);
  if (![targetWidth, sliceHeight, maxSlices, quality].every(value => Number.isSafeInteger(value) && value > 0)
    || quality > 100 || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= sliceHeight) {
    throw new ImageError("INVALID_IMAGE", "이미지 분할 설정을 확인해 주세요. 크기와 상한은 양의 정수이며 겹침은 조각 높이보다 작아야 합니다.");
  }
  await validateUploads(images);
  const plans: Array<{ sourceImage: number; top: number; height: number; width: number; originalHeight: number; resizedHeight: number }> = [];
  for (let sourceImage = 0; sourceImage < images.length; sourceImage++) {
    const metadata = await sharp(images[sourceImage].data).metadata();
    const swapped = metadata.orientation !== undefined && metadata.orientation >= 5;
    const originalWidth = (swapped ? metadata.height : metadata.width)!;
    const originalHeight = (swapped ? metadata.width : metadata.height)!;
    const width = Math.min(targetWidth, originalWidth);
    const resizedHeight = Math.max(1, Math.round(originalHeight * width / originalWidth));
    for (let top = 0; top < resizedHeight; top += sliceHeight - overlap) {
      const height = Math.min(sliceHeight, resizedHeight - top);
      plans.push({ sourceImage, top, height, width, originalHeight, resizedHeight });
      if (top + height === resizedHeight) break;
    }
  }
  if (plans.length > maxSlices) {
    throw new ImageError("TOO_LARGE", `분석 이미지가 ${plans.length}조각으로 상한 ${maxSlices}조각을 초과합니다. 이미지 수나 길이를 줄여 주세요.`);
  }
  const slices: AnalysisSlice[] = [];
  for (let sourceImage = 0; sourceImage < images.length; sourceImage++) {
    const imagePlans = plans.filter(plan => plan.sourceImage === sourceImage);
    try {
      const { data, info } = await sharp(images[sourceImage].data).rotate()
        .resize({ width: imagePlans[0].width, height: imagePlans[0].resizedHeight, fit: "fill", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const plan of imagePlans) {
        const encoded = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .extract({ left: 0, top: plan.top, width: plan.width, height: plan.height })
          .jpeg({ quality }).toBuffer();
        // Coordinates refer to the full-resolution, EXIF-oriented upload, before resizing.
        slices.push({ index: slices.length, sourceImage,
          top: Math.round(plan.top * plan.originalHeight / plan.resizedHeight),
          bottom: Math.round((plan.top + plan.height) * plan.originalHeight / plan.resizedHeight),
          width: plan.width, height: plan.height, mediaType: "image/jpeg", base64: encoded.toString("base64") });
      }
    } catch {
      throw new ImageError("INVALID_IMAGE", "이미지를 분할할 수 없습니다. 올바른 이미지로 다시 업로드해 주세요.");
    }
  }
  return slices;
}
