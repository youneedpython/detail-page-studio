// @vitest-environment node
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAiClient } from "../ai/fake-client";
import { AiError, type AiErrorCode } from "../ai/types";
import { estimateCostUsd } from "../cost";
import { sliceForAnalysis, type UploadedImage } from "../image";
import { POST } from "../../app/api/analyze/route";
import { analyzeDetailPage } from "./engine";
import { createAnalyzeHandler } from "./handler";
import { analysisSystemPrompt, buildAnalysisContent } from "./prompt";
import { sampleAnalysisResponder } from "./sample";
import { analysisOutputSchema, checklistItems, scoreCriteria, type AnalysisOutput } from "./schema";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function image(height = 100): Promise<UploadedImage> {
  const data = await sharp({ create: { width: 860, height, channels: 3, background: "white" } }).png().toBuffer();
  return { name: "dummy.png", mimeType: "image/png", size: data.length, data };
}

function request(images: UploadedImage[], fields: Record<string, string> = {}): Request {
  const form = new FormData();
  for (const upload of images) form.append("images", new Blob([new Uint8Array(upload.data)], { type: upload.mimeType }), upload.name);
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request("http://localhost/api/analyze", { method: "POST", body: form });
}

describe("분석 Prompt와 Schema", () => {
  it("선택 입력 다음에 업로드/조각 순서대로 라벨과 이미지 블록을 구성한다", async () => {
    const slices = await sliceForAnalysis([await image(1500), await image()]);
    const content = buildAnalysisContent(slices, { productName: "가상 상품", price: "100원", category: "생활" });
    expect(content[0]).toEqual({ type: "text", text: "선택 상품 정보\n상품명: 가상 상품\n가격: 100원\n카테고리: 생활" });
    expect(content.filter(block => block.type === "text").slice(1)).toEqual([
      { type: "text", text: "[sliceIndex=0 (조각 1 / 전체 3), 이미지 1]" },
      { type: "text", text: "[sliceIndex=1 (조각 2 / 전체 3), 이미지 1]" },
      { type: "text", text: "[sliceIndex=2 (조각 3 / 전체 3), 이미지 2]" },
    ]);
    slices.forEach((slice, index) => expect(content[index * 2 + 2]).toEqual({ type: "image", mediaType: slice.mediaType, base64: slice.base64 }));
    for (const item of [...checklistItems, ...scoreCriteria]) expect(analysisSystemPrompt).toContain(item);
    expect(analysisSystemPrompt).toContain("80px");
  });

  it("샘플은 요청 조각 수에 맞고 고정 항목과 점수 범위를 검증한다", async () => {
    const fake = new FakeAiClient(sampleAnalysisResponder);
    const result = await fake.generateStructured({ system: analysisSystemPrompt, content: buildAnalysisContent(await sliceForAnalysis([await image()])), schema: analysisOutputSchema });
    expect(result.data.sections.every(section => section.sliceIndex === 0)).toBe(true);
    expect(result.data.summary).toContain("데일리 텀블러 500ml");
    const invalid = structuredClone(result.data);
    invalid.scores[0].score = 11;
    expect(analysisOutputSchema.safeParse(invalid).success).toBe(false);
    invalid.scores[0].score = 5;
    invalid.checklist[1].item = invalid.checklist[0].item;
    expect(analysisOutputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("분석 엔진", () => {
  it("원본 좌표와 비용을 조립하고 범위 밖 시작 조각을 양쪽 경계로 보정한다", async () => {
    const images = [await image(3000)];
    const slices = await sliceForAnalysis(images);
    const fake = new FakeAiClient(async req => {
      const response = await sampleAnalysisResponder(req);
      if (response instanceof AiError) throw response;
      const data = response.data as AnalysisOutput;
      data.sections[0].sliceIndex = -3;
      data.sections[1].sliceIndex = 999;
      return { ...response, data };
    });
    const report = await analyzeDetailPage({ images }, { ai: fake, now: () => new Date("2026-11-03T00:00:00Z") });
    expect(report.id).toMatch(/^[\da-f-]{36}$/);
    expect(report.createdAt).toBe("2026-11-03T00:00:00.000Z");
    for (const [index, slice] of [slices[0], slices.at(-1)!].entries()) {
      expect(report.sections[index].sourceSlice).toEqual({ index: slice.index, top: slice.top, bottom: slice.bottom });
      expect(report.sections[index]).not.toHaveProperty("sliceIndex");
    }
    expect(report.usage).toEqual({ input: 1000, output: 500, estimatedCostUsd: estimateCostUsd({ input: 1000, output: 500 }) });
    expect(fake.calls[0].effort).toBe("high");
    expect(fake.calls[0]).not.toHaveProperty("maxTokens");
    expect(JSON.stringify(report)).not.toContain("base64");
  });

  it("잘못된 모델 출력은 AI_INVALID_OUTPUT이다", async () => {
    await expect(analyzeDetailPage({ images: [await image()] }, { ai: new FakeAiClient([{ data: {}, usage: { input: 0, output: 0 } }]) }))
      .rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });
});

describe("분석 Handler / Route", () => {
  it("fake Route는 이미지 한 장으로 200 샘플 리포트를 반환한다", async () => {
    vi.stubEnv("AI_CLIENT", "fake");
    const response = await POST(request([await image()]));
    expect(response.status).toBe(200);
    expect((await response.json()).summary).toContain("데일리 텀블러 500ml");
  });

  it("선택 필드를 100자로 자르고 업로드 순서를 유지한다", async () => {
    const fake = new FakeAiClient(sampleAnalysisResponder);
    const response = await createAnalyzeHandler({ ai: fake })(request([await image(1500), await image()], { productName: "가".repeat(110), price: "나".repeat(110), category: "다".repeat(110) }));
    expect(response.status).toBe(200);
    const first = fake.calls[0].content[0];
    expect(first.type === "text" && first.text).toBe(`선택 상품 정보\n상품명: ${"가".repeat(100)}\n가격: ${"나".repeat(100)}\n카테고리: ${"다".repeat(100)}`);
    expect(fake.calls[0].content[5]).toEqual({ type: "text", text: "[sliceIndex=2 (조각 3 / 전체 3), 이미지 2]" });
  });

  it.each<[AiErrorCode, number]>([["BUDGET_EXCEEDED", 429], ["AI_UNAVAILABLE", 502], ["AI_INVALID_OUTPUT", 502], ["AI_TIMEOUT", 504], ["AI_REFUSED", 422]])("%s를 %i로 매핑한다", async (code, status) => {
    const response = await createAnalyzeHandler({ ai: new FakeAiClient([new AiError(code)]) })(request([await image()]));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: expect.stringMatching(/[가-힣]/) } });
  });

  it("빈 업로드 / 잘못된 MIME / 문자열 업로드 / 잘못된 multipart는 400이다", async () => {
    const handler = createAnalyzeHandler({ ai: new FakeAiClient() });
    const invalid = { ...await image(), mimeType: "text/plain" };
    const form = new FormData(); form.append("images", "not a file");
    for (const req of [request([]), request([invalid]), new Request("http://localhost", { method: "POST", body: form }), new Request("http://localhost", { method: "POST", body: "bad" })]) {
      const response = await handler(req);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "INVALID_IMAGE", message: expect.stringMatching(/[가-힣]/) } });
    }
  });

  it("장수 초과와 조각 상한 초과는 413이다", async () => {
    const upload = await image();
    const handler = createAnalyzeHandler({ ai: new FakeAiClient() });
    vi.stubEnv("AI_MAX_SLICES_PER_ANALYSIS", "1");
    for (const req of [request(Array.from({ length: 11 }, () => upload)), request([await image(1500)])]) {
      const response = await handler(req);
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: { code: "TOO_LARGE", message: expect.stringMatching(/[가-힣]/) } });
    }
  });

  it("알 수 없는 AI 오류는 서버에만 기록하고 내부 메시지를 숨긴다", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("private authentication detail");
    const fake = new FakeAiClient(() => { throw failure; });
    const response = await createAnalyzeHandler({ ai: fake })(request([await image()]));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: expect.stringMatching(/[가-힣]/) } });
    expect(logging).toHaveBeenCalledWith(expect.any(String), failure);
  });

  it("잘못된 분할 설정과 Route 생성 시 설정 오류는 상세 정보 없는 500이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AI_MAX_SLICES_PER_ANALYSIS", "invalid");
    let response = await createAnalyzeHandler({ ai: new FakeAiClient() })(request([await image()]));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Invalid analysis slice limit");
    vi.stubEnv("AI_CLIENT", "fake"); vi.stubEnv("AI_MONTHLY_BUDGET_USD", "invalid");
    response = await POST(request([await image()]));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Invalid monthly AI budget");
  });
});
