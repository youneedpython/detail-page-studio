// @vitest-environment node
import OpenAI from "openai";
import { LengthFinishReasonError, ContentFilterFinishReasonError } from "openai/core/error";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { analysisOutputSchema } from "../analysis/schema";
import { draftOutputSchema } from "../generation/schema";
import { describe, expect, it, vi } from "vitest";
import { OPENAI_MODEL, OpenAiAiClient, type OpenAiTransport } from "./openai-client";

const request = { system: "Return a title", content: [{ type: "text" as const, text: "Example" }], schema: z.object({ title: z.string() }) };
const response = { status: "completed", output: [], output_parsed: { title: "Example" }, usage: { ["input_" + "tokens"]: 100, ["output_" + "tokens"]: 20 } };
function client(parse: ReturnType<typeof vi.fn>) {
  return new OpenAiAiClient({ responses: { parse } } as unknown as OpenAiTransport);
}

describe("OpenAiAiClient", () => {
  it("converts the unchanged analysis and generation schemas", () => {
    for (const schema of [analysisOutputSchema, draftOutputSchema]) {
      expect(zodTextFormat(schema, "output")).toMatchObject({ type: "json_schema", strict: true, schema: { type: "object" } });
    }
  });
  it("sends structured text and image input and returns validated output and usage", async () => {
    const parse = vi.fn().mockResolvedValue(response);
    expect(await client(parse).generateStructured({ ...request, content: [...request.content, { type: "image", mediaType: "image/png", base64: "ZHVtbXk=" }] })).toEqual({ data: { title: "Example" }, usage: { input: 100, output: 20 } });
    const sent = parse.mock.calls[0][0];
    expect(sent.model).toBe(OPENAI_MODEL);
    expect(sent.instructions).toBe(request.system);
    expect(sent.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "Example" }, { type: "input_image", image_url: "data:image/png;base64,ZHVtbXk=", detail: "high" }] }]);
    expect(sent.text.format).toMatchObject({ type: "json_schema", name: "output", strict: true, schema: { type: "object", required: ["title"] } });
    expect(sent.reasoning).toEqual({ effort: "medium" });
    expect(sent.max_output_tokens).toBe(16000);
    for (const effort of ["low", "medium", "high"] as const) {
      await client(parse).generateStructured({ ...request, effort, ["maxTokens"]: 800 });
      expect(parse.mock.lastCall?.[0].reasoning).toEqual({ effort });
      expect(parse.mock.lastCall?.[0].max_output_tokens).toBe(800);
    }
  });
  it.each([
    [{ ...response, output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }], status: "incomplete", output_parsed: null }, "AI_REFUSED"],
    [{ ...response, status: "incomplete" }, "AI_INVALID_OUTPUT"],
    [{ ...response, output_parsed: null }, "AI_INVALID_OUTPUT"],
    [{ ...response, output_parsed: {} }, "AI_INVALID_OUTPUT"],
  ])("rejects unusable output", async (reply, code) => {
    await expect(client(vi.fn().mockResolvedValue(reply)).generateStructured(request)).rejects.toMatchObject({ code });
  });
  it("enforces refinements after parsing", async () => {
    await expect(client(vi.fn().mockResolvedValue(response)).generateStructured({ ...request, schema: request.schema.refine(data => data.title !== "Example") })).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });
  it.each([
    [new OpenAI.APIConnectionTimeoutError(), "AI_TIMEOUT"],
    [new OpenAI.APIConnectionError({}), "AI_UNAVAILABLE"],
    [new OpenAI.RateLimitError(429, undefined, "limited", new Headers()), "AI_UNAVAILABLE"],
    [new OpenAI.InternalServerError(500, undefined, "unavailable", new Headers()), "AI_UNAVAILABLE"],
    [new LengthFinishReasonError(), "AI_INVALID_OUTPUT"],
    [new ContentFilterFinishReasonError(), "AI_REFUSED"],
  ])("maps SDK failures", async (error, code) => {
    await expect(client(vi.fn().mockRejectedValue(error)).generateStructured(request)).rejects.toMatchObject({ code });
  });
  it("preserves unrelated errors", async () => {
    const error = new Error("timeout rate limit");
    await expect(client(vi.fn().mockRejectedValue(error)).generateStructured(request)).rejects.toBe(error);
  });
});
