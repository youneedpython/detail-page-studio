export interface UploadedImage {
  name: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

export interface AnalysisSlice {
  index: number;
  sourceImage: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  mediaType: "image/jpeg";
  base64: string;
}

export class ImageError extends Error {
  constructor(public readonly code: "INVALID_IMAGE" | "TOO_LARGE", message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export interface SliceOptions {
  targetWidth?: number;
  sliceHeight?: number;
  overlap?: number;
  quality?: number;
  maxSlices?: number;
}
