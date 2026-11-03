// @vitest-environment node
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageError, sliceForAnalysis, validateUploads, type UploadedImage } from "./index";

async function upload(width = 860, height = 100, format: "png" | "jpeg" | "webp" = "png"): Promise<UploadedImage> {
  const data = await sharp({ create: { width, height, channels: 3, background: "red" } }).toFormat(format).toBuffer();
  return { name: `fixture.${format}`, mimeType: `image/${format}`, size: data.length, data };
}

afterEach(() => vi.unstubAllEnvs());

describe("validateUploads", () => {
  it.each(["png", "jpeg", "webp"] as const)("accepts %s", async format => {
    await expect(validateUploads([await upload(300, 100, format)])).resolves.toBeUndefined();
  });
  it("checks count boundaries", async () => {
    const image = await upload();
    await expect(validateUploads([])).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(validateUploads(Array(10).fill(image))).resolves.toBeUndefined();
    await expect(validateUploads(Array(11).fill(image))).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
  it("rejects unsupported, forged and mismatched MIME and corrupt pixels", async () => {
    const image = await upload();
    for (const candidate of [
      { ...image, mimeType: "image/gif" },
      { ...image, data: Buffer.from("not an image") },
      { ...image, mimeType: "image/jpeg" },
      { ...image, data: image.data.subarray(0, 60) },
    ]) await expect(validateUploads([candidate])).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("enforces bytes and minimum width", async () => {
    const image = await upload();
    await expect(validateUploads([{ ...image, size: 20 * 1024 * 1024 }])).resolves.toBeUndefined();
    await expect(validateUploads([{ ...image, size: 20 * 1024 * 1024 + 1 }])).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(validateUploads([{ ...image, size: 1, data: Buffer.alloc(20 * 1024 * 1024 + 1) }])).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(validateUploads([await upload(299)])).rejects.toBeInstanceOf(ImageError);
  });
});

describe("sliceForAnalysis", () => {
  it("resizes and maps overlap and final height to original coordinates", async () => {
    const slices = await sliceForAnalysis([await upload(1720, 6000)]);
    expect(slices.map(({ top, bottom, width, height }) => ({ top, bottom, width, height }))).toEqual([
      { top: 0, bottom: 2800, width: 860, height: 1400 },
      { top: 2640, bottom: 5440, width: 860, height: 1400 },
      { top: 5280, bottom: 6000, width: 860, height: 360 },
    ]);
    for (const slice of slices) {
      expect(await sharp(Buffer.from(slice.base64, "base64")).metadata()).toMatchObject({ format: "jpeg", width: slice.width, height: slice.height });
    }
  });
  it("covers the bottom row when resizing an odd aspect ratio", async () => {
    const slices = await sliceForAnalysis([await upload(1721, 5999)]);
    const resizedHeight = Math.round(5999 * 860 / 1721);
    expect(slices).toHaveLength(3);
    expect(slices.map(slice => slice.height)).toEqual([1400, 1400, resizedHeight - 2640]);
    expect(slices[0].top).toBe(0);
    expect(slices[2].bottom).toBe(5999);
    for (const slice of slices) {
      expect(slice.top).toBe(Math.round(slice.index * 1320 * 5999 / resizedHeight));
      expect(slice.bottom).toBe(Math.round((slice.index * 1320 + slice.height) * 5999 / resizedHeight));
      expect(await sharp(Buffer.from(slice.base64, "base64")).metadata())
        .toMatchObject({ width: 860, height: slice.height });
    }
  });
  it("does not enlarge or join uploads and preserves global order", async () => {
    const slices = await sliceForAnalysis([await upload(400, 1400), await upload(300, 1500)]);
    expect(slices.map(s => [s.index, s.sourceImage, s.width, s.height, s.top, s.bottom])).toEqual([
      [0, 0, 400, 1400, 0, 1400], [1, 1, 300, 1400, 0, 1400], [2, 1, 300, 180, 1320, 1500],
    ]);
  });
  it("retains stripe content at slice boundaries", async () => {
    const data = await sharp({ create: { width: 300, height: 2000, channels: 3, background: "red" } })
      .composite([{ input: await sharp({ create: { width: 300, height: 680, channels: 3, background: "blue" } }).png().toBuffer(), top: 1320, left: 0 }]).png().toBuffer();
    const slices = await sliceForAnalysis([{ name: "stripes.png", mimeType: "image/png", size: data.length, data }]);
    const { data: pixels } = await sharp(Buffer.from(slices[1].base64, "base64")).raw().toBuffer({ resolveWithObject: true });
    expect(pixels[2]).toBeGreaterThan(240);
    expect(pixels[0]).toBeLessThan(15);
  });
  it("uses environment limits, empty default and explicit override", async () => {
    const images = [await upload(300, 2800)];
    vi.stubEnv("AI_MAX_SLICES_PER_ANALYSIS", "2");
    await expect(sliceForAnalysis(images)).rejects.toMatchObject({ code: "TOO_LARGE", message: expect.stringContaining("3조각으로 상한 2조각") });
    expect(await sliceForAnalysis(images, { maxSlices: 3 })).toHaveLength(3);
    vi.stubEnv("AI_MAX_SLICES_PER_ANALYSIS", " ");
    expect(await sliceForAnalysis(images)).toHaveLength(3);
    vi.stubEnv("AI_MAX_SLICES_PER_ANALYSIS", undefined);
    await expect(sliceForAnalysis(Array(10).fill(images[0]))).rejects.toMatchObject({ code: "TOO_LARGE", message: expect.stringContaining("30조각으로 상한 24조각") });
  });
  it("rejects invalid options before entering a slicing loop", async () => {
    const images = [await upload()];
    for (const options of [{ overlap: 1400 }, { overlap: -1 }, { sliceHeight: 0 }, { targetWidth: NaN }, { maxSlices: Infinity }, { quality: 101 }]) {
      await expect(sliceForAnalysis(images, options)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    }
  });
  it("rotates EXIF and flattens transparent pixels to white", async () => {
    const data = await sharp({ create: { width: 400, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .withMetadata({ orientation: 6 }).png().toBuffer();
    const [slice] = await sliceForAnalysis([{ name: "alpha.png", mimeType: "image/png", size: data.length, data }]);
    expect(slice).toMatchObject({ width: 600, height: 400, top: 0, bottom: 400 });
    const { data: pixels, info } = await sharp(Buffer.from(slice.base64, "base64")).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([...pixels.subarray(0, 3)]).toEqual([255, 255, 255]);
  });
});
