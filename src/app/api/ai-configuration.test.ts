// @vitest-environment node
import sharp from "sharp";
import { afterEach, expect, test, vi } from "vitest";
import { POST as analyze } from "./analyze/route";
import { POST as generate } from "./generate/route";
import { AnthropicAiClient } from "../../lib/ai/anthropic-client";
import { OpenAiAiClient } from "../../lib/ai/openai-client";
import { credentialEnv } from "../../lib/ai/provider";
import { FakeAiClient } from "../../lib/ai/fake-client";
import { BudgetGuard } from "../../lib/cost";
import { sampleAnalysisResponder } from "../../lib/analysis/sample";
import { sampleDraftResponder } from "../../lib/generation/sample";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function requests() {
  const data = await sharp({ create: { width: 860, height: 100, channels: 3, background: "white" } }).png().toBuffer();
  const form = new FormData();
  form.append("images", new Blob([new Uint8Array(data)], { type: "image/png" }), "dummy.png");
  return [
    () => analyze(new Request("http://localhost/api/analyze", { method: "POST", body: form })),
    () => generate(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ product: { name: "가상 상품", features: ["가상 특징"] }, myImages: [] }), headers: { "Content-Type": "application/json" } })),
  ];
}

test.each(["openai", "anthropic"] as const)("%s 설정 누락은 두 Route에서 AI 호출 없이 503을 반환한다", async provider => {
 for (const credential of [undefined, "", "   "]) {
  vi.stubEnv("AI_CLIENT", undefined);
  vi.stubEnv("AI_PROVIDER", provider);
  vi.stubEnv(credentialEnv[provider], credential);
  vi.stubEnv(credentialEnv[provider === "openai" ? "anthropic" : "openai"], "dummy-unused");
  const call = vi.spyOn(AnthropicAiClient.prototype, "generateStructured");
  const openaiCall = vi.spyOn(OpenAiAiClient.prototype, "generateStructured");
  const logging = vi.spyOn(console, "error").mockImplementation(() => {});
  for (const request of await requests()) {
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "AI_NOT_CONFIGURED", message: "AI 연결 설정이 필요합니다. .env.local에 사용할 AI의 인증 값(OPENAI_API_KEY 또는 ANTHROPIC_API_KEY)을 넣거나 AI_CLIENT=fake로 체험 모드를 사용하세요." } });
  }
  expect(call).not.toHaveBeenCalled();
  expect(openaiCall).not.toHaveBeenCalled();
  expect(logging).not.toHaveBeenCalled();
 }
});

test.each(["fake", "openai", "anthropic"])("%s 모드는 두 Route에서 200이며 환경값을 노출하지 않는다", async mode => {
  const marker = "dummy-configuration-marker";
  vi.stubEnv("AI_CLIENT", mode === "fake" ? "fake" : undefined);
  vi.stubEnv("AI_PROVIDER", mode === "fake" ? "openai" : mode);
  vi.stubEnv("ANTHROPIC_API_KEY", mode === "anthropic" ? marker : undefined);
  vi.stubEnv("OPENAI_API_KEY", mode === "openai" ? marker : undefined);
  vi.stubEnv("AI_MONTHLY_BUDGET_USD", "30");
  vi.stubEnv("AI_MAX_SLICES_PER_ANALYSIS", "24");
  // Isolate accounting and replace the real transport; never access a credential or network.
  vi.spyOn(BudgetGuard.prototype, "assertAvailable").mockResolvedValue();
  vi.spyOn(BudgetGuard.prototype, "record").mockResolvedValue();
  const fake = new FakeAiClient(request => request.content.some(block => block.type === "image") ? sampleAnalysisResponder(request) : sampleDraftResponder(request));
  const call = vi.spyOn(AnthropicAiClient.prototype, "generateStructured").mockImplementation(request => fake.generateStructured(request));
  const openaiCall = vi.spyOn(OpenAiAiClient.prototype, "generateStructured").mockImplementation(request => fake.generateStructured(request));
  for (const request of await requests()) {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(marker);
  }
  expect(call).toHaveBeenCalledTimes(mode === "anthropic" ? 2 : 0);
  expect(openaiCall).toHaveBeenCalledTimes(mode === "openai" ? 2 : 0);
});

test("잘못된 제공자는 두 Route에서 503을 반환하며 환경값을 노출하지 않는다", async () => {
  const marker = "dummy-invalid-provider";
  vi.stubEnv("AI_CLIENT", undefined);
  vi.stubEnv("AI_PROVIDER", marker);
  const call = vi.spyOn(AnthropicAiClient.prototype, "generateStructured");
  const openaiCall = vi.spyOn(OpenAiAiClient.prototype, "generateStructured");
  for (const request of await requests()) {
    const response = await request();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("AI_NOT_CONFIGURED");
    expect(body).not.toContain(marker);
  }
  expect(call).not.toHaveBeenCalled();
  expect(openaiCall).not.toHaveBeenCalled();
});
