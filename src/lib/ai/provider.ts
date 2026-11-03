import { AiError } from "./types";

export type AiProvider = "openai" | "anthropic";

export const credentialEnv: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export function resolveAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "openai";
  if (provider === "openai" || provider === "anthropic") return provider;
  throw new AiError("AI_NOT_CONFIGURED");
}
