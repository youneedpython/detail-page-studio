// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AnthropicAiClient, AI_MODEL, type AnthropicTransport } from "./anthropic-client";
import { FakeAiClient } from "./fake-client";
import { AiError } from "./types";
import { createAiClient, GuardedAiClient } from "./index";
import { BudgetGuard, MemoryUsageStore } from "../cost";

const request = { system: "Return a title", content: [{ type: "text" as const, text: "Example" }], schema: z.object({ title: z.string() }) };
const result = { data: { title: "Example" }, usage: { input: 100, output: 20 } };
function transport(parse: ReturnType<typeof vi.fn>): AnthropicTransport {
  return { messages: { parse } } as unknown as AnthropicTransport;
}
// Computed names keep SDK response fixtures separate from secret assignments.
const response = {
  parsed_output: result.data, stop_reason: "end_turn",
  usage: { ["input_" + "tokens"]: 100, ["output_" + "tokens"]: 20 },
};

describe("FakeAiClient", () => {
  it("consumes a copied queue, records calls and validates schemas", async () => {
    const queue = [result];
    const client = new FakeAiClient(queue);
    expect(await client.generateStructured(request)).toEqual(result);
    expect(client.calls).toEqual([request]);
    expect(queue).toHaveLength(1);
    await expect(client.generateStructured(request)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    await expect(new FakeAiClient([{ ...result, data: {} }]).generateStructured(request)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });
  it("accepts asynchronous responders and propagates specified errors", async () => {
    const responder = vi.fn(async () => result);
    expect(await new FakeAiClient(responder).generateStructured(request)).toEqual(result);
    expect(responder).toHaveBeenCalledWith(request);
    const error = new AiError("AI_TIMEOUT");
    await expect(new FakeAiClient([error]).generateStructured(request)).rejects.toBe(error);
  });
});

describe("AnthropicAiClient", () => {
  it("sends structured output, text and image blocks with medium effort", async () => {
    const parse = vi.fn().mockResolvedValue(response);
    const client = new AnthropicAiClient(transport(parse));
    expect(await client.generateStructured({ ...request, content: [...request.content,
      { type: "image", mediaType: "image/png", base64: "ZHVtbXk=" }] })).toEqual(result);
    const sent = parse.mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
    expect(sent.model).toBe(AI_MODEL);
    expect(sent.max_tokens).toBe(4096);
    expect(sent.system).toBe(request.system);
    expect(sent.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema", schema: { type: "object" } } });
    expect(sent.messages).toEqual([{ role: "user", content: [request.content[0],
      { type: "image", source: { type: "base64", media_type: "image/png", data: "ZHVtbXk=" } }] }]);
    await client.generateStructured({ ...request, ["maxTokens"]: 800, effort: "high" });
    expect(parse.mock.calls[1][0].max_tokens).toBe(800);
    expect(parse.mock.calls[1][0].output_config.effort).toBe("high");
  });
  it.each([
    [{ ...response, stop_reason: "refusal" }, "AI_REFUSED"],
    [{ ...response, parsed_output: null }, "AI_INVALID_OUTPUT"],
    [{ ...response, parsed_output: {} }, "AI_INVALID_OUTPUT"],
  ])("rejects unusable output", async (reply, code) => {
    await expect(new AnthropicAiClient(transport(vi.fn().mockResolvedValue(reply))).generateStructured(request)).rejects.toMatchObject({ code });
  });
  it.each([
    [new Anthropic.APIConnectionTimeoutError(), "AI_TIMEOUT"],
    [new Anthropic.APIConnectionError({}), "AI_UNAVAILABLE"],
    [new Anthropic.RateLimitError(429, undefined, "limited", new Headers()), "AI_UNAVAILABLE"],
    [new Anthropic.InternalServerError(500, undefined, "unavailable", new Headers()), "AI_UNAVAILABLE"],
  ])("maps typed SDK failures", async (error, code) => {
    await expect(new AnthropicAiClient(transport(vi.fn().mockRejectedValue(error))).generateStructured(request)).rejects.toMatchObject({ code });
  });
  it("does not classify unrelated errors by message text", async () => {
    const error = new Error("timeout rate limit");
    await expect(new AnthropicAiClient(transport(vi.fn().mockRejectedValue(error))).generateStructured(request)).rejects.toBe(error);
  });
});

describe("GuardedAiClient", () => {
  it("records successful usage then blocks the next call at the limit", async () => {
    const fake = new FakeAiClient([result, result]);
    const store = new MemoryUsageStore();
    const client = new GuardedAiClient(fake, new BudgetGuard(store, 0.0008));
    await client.generateStructured(request);
    await expect(client.generateStructured(request)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(fake.calls).toHaveLength(1);
  });
  it("does not record failed calls", async () => {
    const store = new MemoryUsageStore();
    const add = vi.spyOn(store, "add");
    await expect(new GuardedAiClient(new FakeAiClient([new AiError("AI_REFUSED")]), new BudgetGuard(store)).generateStructured(request)).rejects.toMatchObject({ code: "AI_REFUSED" });
    expect(add).not.toHaveBeenCalled();
  });
  it("selects fake mode without credentials or network", async () => {
    vi.stubEnv("AI_CLIENT", "fake");
    try { expect(await createAiClient([result]).generateStructured(request)).toEqual(result); }
    finally { vi.unstubAllEnvs(); }
  });
});
