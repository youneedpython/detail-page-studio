// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { credentialEnv, resolveAiProvider } from "./provider";
import { createAiClient } from "./index";

afterEach(() => vi.unstubAllEnvs());
it("constructs fake mode without resolving the provider or credentials", () => {
  vi.stubEnv("AI_CLIENT", "fake");
  vi.stubEnv("AI_PROVIDER", "invalid");
  expect(() => createAiClient()).not.toThrow();
});
it.each([undefined, "", "  ", " OpenAI ", "OPENAI"])("defaults and normalizes openai (%s)", value => {
  vi.stubEnv("AI_PROVIDER", value);
  expect(resolveAiProvider()).toBe("openai");
});
it("normalizes anthropic and rejects unsupported providers", () => {
  vi.stubEnv("AI_PROVIDER", " AnThRoPiC ");
  expect(resolveAiProvider()).toBe("anthropic");
  vi.stubEnv("AI_PROVIDER", "unsupported");
  expect(resolveAiProvider).toThrow(expect.objectContaining({ code: "AI_NOT_CONFIGURED" }));
});
it.each(["openai", "anthropic"] as const)("requires only the selected credential (%s)", provider => {
  vi.stubEnv("AI_CLIENT", undefined);
  vi.stubEnv("AI_PROVIDER", provider);
  vi.stubEnv(credentialEnv[provider], "  ");
  vi.stubEnv(credentialEnv[provider === "openai" ? "anthropic" : "openai"], "dummy-unused");
  expect(createAiClient).toThrow(expect.objectContaining({ code: "AI_NOT_CONFIGURED" }));
});
