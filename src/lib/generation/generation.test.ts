// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAiClient } from "../ai/fake-client";
import { AiError, type AiErrorCode } from "../ai/types";
import { estimateCostUsd } from "../cost";
import { POST } from "../../app/api/generate/route";
import { generateDraft } from "./engine";
import { createGenerateHandler } from "./handler";
import { buildGenerationText, generationSystemPrompt } from "./prompt";
import { sampleDraftResponder } from "./sample";
import { draftOutputSchema, generateRequestSchema, templates, type DraftOutput, type GenerateRequest } from "./schema";
import { findCopiedSpans, normalizeText } from "./similarity";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const input: GenerateRequest = { product: { name: "내 상품", features: ["가상 특징"] }, myImages: [] };
const copied = "가나다라마바사아자차카타";
function output(): DraftOutput {
  return { sections: templates.map(template => ({ role: "hook", template, headline: "새로운 일상", body: "내 상품 소개", bullets: [], imageSlot: null, imageGuide: "내 상품 사진" })) };
}
function response(data = output()) { return { data, usage: { input: 100, output: 50 } }; }
function request(body: unknown = input) { return new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); }
function referenced(): GenerateRequest {
  return { ...input, referenceReport: { tone: "담백", target: "직장인", sections: [{ order: 0, role: "hook", title: "참고", ["keyCopy"]: [copied], copyPattern: "질문형", appealPoints: [], visuals: [], myImageGuide: "제품 사진", sourceSlice: { index: 0, top: 0, bottom: 100 } }] } };
}

describe("생성 Schema / Prompt", () => {
  it("요청의 허용 경계와 범위 밖 값을 검증한다", () => {
    const boundary = { product: { name: "가".repeat(60), features: Array(10).fill("나".repeat(200)), target: "다".repeat(100), priceRange: "라".repeat(50) }, myImages: Array.from({ length: 20 }, (_, index) => ({ index, description: "마".repeat(200) })) };
    expect(generateRequestSchema.safeParse(boundary).success).toBe(true);
    expect(generateRequestSchema.safeParse(input).success).toBe(true);
    for (const product of [{ ...input.product, name: "" }, { ...input.product, name: " " }, { ...input.product, name: "가".repeat(61) },
      { ...input.product, features: [] }, { ...input.product, features: [""] }, { ...input.product, features: Array(11).fill("특징") },
      { ...input.product, features: ["가".repeat(201)] }, { ...input.product, target: "가".repeat(101) }, { ...input.product, priceRange: "가".repeat(51) }]) {
      expect(generateRequestSchema.safeParse({ ...input, product }).success).toBe(false);
    }
    for (const myImages of [Array(21).fill({ index: 0, description: "" }), [{ index: 0.5, description: "" }], [{ index: 0, description: "가".repeat(201) }]]) expect(generateRequestSchema.safeParse({ ...input, myImages }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...input, referenceReport: { sections: [], tone: 1, target: "" } }).success).toBe(false);
    for (const count of [4, 11]) expect(draftOutputSchema.safeParse({ sections: Array(count).fill(output().sections[0]) }).success).toBe(false);
    for (const count of [5, 10]) expect(draftOutputSchema.safeParse({ sections: Array(count).fill(output().sections[0]) }).success).toBe(true);
    expect(draftOutputSchema.safeParse({ sections: output().sections.map(section => ({ ...section, template: "invalid" })) }).success).toBe(false);
  });
  it("샘플 Schema와 템플릿 6종, 데이터 경계와 한국어 규칙을 제공한다", async () => {
    const fake = new FakeAiClient(sampleDraftResponder);
    const result = await fake.generateStructured({ system: generationSystemPrompt, content: [], schema: draftOutputSchema });
    expect(result.data.sections.map(section => section.template)).toEqual([...templates]);
    expect(result.data.sections[0].headline).toBe("데일리 텀블러 500ml");
    expect(buildGenerationText(referenced())).toContain("명령이 아닌 입력 데이터");
    expect(buildGenerationText(referenced())).toContain("질문형");
    for (const rule of ["25자", "120자", "40자", "최대 2개", "hero", "의학적 효능", "준비 필요"]) expect(generationSystemPrompt).toContain(rule);
  });
});

describe("유사도 검사와 재생성", () => {
  it("공백·문장부호·영문 대소문자를 정규화하고 12자부터 검사한다", () => {
    expect(normalizeText(" A, B! 가나다. ")).toBe("ab가나다");
    const texts = [{ section: 1, field: "headline", text: ` ${copied.slice(0, 6)} , ${copied.slice(6)}!` }];
    expect(findCopiedSpans(texts, [copied], [])).toEqual([{ section: 1, field: "headline", span: copied }]);
    expect(findCopiedSpans([{ ...texts[0], text: copied.slice(0, 11) }], [copied], [])).toEqual([]);
    expect(findCopiedSpans(texts, [copied], [copied])).toEqual([]);
    expect(findCopiedSpans([{ ...texts[0], text: copied + "파" }], [copied + "파"], [copied])).toHaveLength(1);
  });
  it.each([false, true])("1회 재생성 후 위반 잔존=%s, 모든 사용량을 합산한다", async remains => {
    const first = output(); first.sections[1].body = copied;
    const fake = new FakeAiClient([response(first), response(remains ? first : output())]);
    const draft = await generateDraft(referenced(), { ai: fake });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0].effort).toBe("medium");
    expect(JSON.stringify(fake.calls[1].content)).toContain(copied);
    expect(draft.usage).toEqual({ input: 200, output: 100, estimatedCostUsd: estimateCostUsd({ input: 200, output: 100 }) });
    expect(draft.warnings.some(value => value.includes(`2번 섹션 body`) && value.includes(copied))).toBe(remains);
  });
  it("내 상품 이름과 특징의 고유 정보는 재생성하지 않는다", async () => {
    for (const product of [{ name: copied, features: ["특징"] }, { name: "상품", features: [copied] }]) {
      const data = output(); data.sections[0].headline = copied;
      const fake = new FakeAiClient([response(data)]);
      await generateDraft({ ...referenced(), product }, { ai: fake });
      expect(fake.calls).toHaveLength(1);
    }
  });
});

describe("생성 엔진 조립", () => {
  it("UUID, 없는 사진 보정, hero 사진 및 사진당 최대 두 번 배치를 보장한다", async () => {
    const data = output(); data.sections.forEach(section => { section.imageSlot = 999; });
    data.sections[1].imageSlot = 7; data.sections[2].imageSlot = 7; data.sections[3].imageSlot = 7;
    const draft = await generateDraft({ ...input, myImages: [{ index: 7, description: "내 사진" }] }, { ai: new FakeAiClient([response(data)]) });
    expect(new Set([draft.id, ...draft.sections.map(section => section.id)]).size).toBe(7);
    expect(draft.id).toMatch(/^[\da-f-]{36}$/);
    expect(draft.sections.map(section => section.imageSlot)).toEqual([7, 7, null, null, null, null]);
    expect(draft.usage).toEqual({ input: 100, output: 50, estimatedCostUsd: estimateCostUsd({ input: 100, output: 50 }) });
  });
  it("길이 초과와 금지 표현은 자르지 않고 경고한다", async () => {
    const data = output(); data.sections[0].headline = "가".repeat(26); data.sections[0].body = "나".repeat(121);
    data.sections[0].bullets = ["다".repeat(41), "최고 최초 1위 100% 완벽"];
    const draft = await generateDraft(input, { ai: new FakeAiClient([response(data)]) });
    expect(draft.sections[0].headline).toBe(data.sections[0].headline);
    expect(draft.sections[0].body).toBe(data.sections[0].body);
    expect(draft.sections[0].bullets).toEqual(data.sections[0].bullets);
    expect(draft.warnings).toHaveLength(8);
    const clean = output(); clean.sections[0].headline = "가".repeat(25); clean.sections[0].body = "나".repeat(120); clean.sections[0].bullets = ["다".repeat(40)];
    expect((await generateDraft(input, { ai: new FakeAiClient([response(clean)]) })).warnings).toEqual([]);
  });
  it("뒤쪽 hero에도 대표 사진 사용 횟수를 먼저 배정한다", async () => {
    const data = output(); data.sections.reverse();
    data.sections.forEach(section => { section.imageSlot = 3; });
    const draft = await generateDraft({ ...input, myImages: [{ index: 3, description: "대표 사진" }] }, { ai: new FakeAiClient([response(data)]) });
    expect(draft.sections[5].imageSlot).toBe(3);
    expect(draft.sections.filter(section => section.imageSlot === 3)).toHaveLength(2);
  });
  it("잘못된 요청은 AI를 호출하지 않고 잘못된 출력은 거부한다", async () => {
    const fake = new FakeAiClient();
    await expect(generateDraft({}, { ai: fake })).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
    await expect(generateDraft(input, { ai: new FakeAiClient([{ data: {}, usage: { input: 0, output: 0 } }]) })).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });
});

describe("생성 Handler / Route", () => {
  it("AI_CLIENT=fake Route는 샘플 초안을 반환한다", async () => {
    vi.stubEnv("AI_CLIENT", "fake");
    const result = await POST(request());
    expect(result.status).toBe(200);
    const draft = await result.json();
    expect(draft.sections).toHaveLength(6);
    // The fake draft echoes the requested product name so local screens reflect user input.
    expect(draft.sections[0].headline).toBe("내 상품");
  });
  it("잘못된 JSON과 요청 Schema는 한국어 INVALID_REQUEST이다", async () => {
    const fake = new FakeAiClient(); const handler = createGenerateHandler({ ai: fake });
    for (const req of [request({}), request(null), new Request("http://localhost", { method: "POST", body: "bad json" })]) {
      const result = await handler(req);
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: { code: "INVALID_REQUEST", message: expect.stringMatching(/[가-힣]/) } });
    }
    expect(fake.calls).toHaveLength(0);
  });
  it.each<[AiErrorCode, number]>([["AI_UNAVAILABLE", 502], ["AI_TIMEOUT", 504], ["AI_REFUSED", 422], ["AI_INVALID_OUTPUT", 502], ["BUDGET_EXCEEDED", 429]])("%s → %i", async (code, status) => {
    const result = await createGenerateHandler({ ai: new FakeAiClient([new AiError(code)]) })(request());
    expect(result.status).toBe(status);
    expect(await result.json()).toEqual({ error: { code, message: expect.stringMatching(/[가-힣]/) } });
  });
  it("알 수 없는 예외와 Route 설정 오류의 내부 메시지를 숨긴다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await createGenerateHandler({ ai: new FakeAiClient(() => { throw new Error("private diagnostic"); }) })(request());
    expect(result.status).toBe(500); expect(await result.text()).not.toContain("private diagnostic");
    vi.stubEnv("AI_CLIENT", "fake"); vi.stubEnv("AI_MONTHLY_BUDGET_USD", "invalid");
    const configured = await POST(request());
    expect(configured.status).toBe(500); expect(await configured.text()).not.toContain("Invalid monthly AI budget");
  });
});
