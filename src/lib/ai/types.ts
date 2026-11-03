import type { z } from "zod";

export type AiContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string };

export interface StructuredRequest<T> {
  system: string;
  content: AiContent[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface AiUsage { input: number; output: number }
export interface StructuredResult<T> { data: T; usage: AiUsage }
export interface AiClient {
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export type AiErrorCode = "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE" | "AI_TIMEOUT" | "AI_REFUSED" | "AI_INVALID_OUTPUT" | "BUDGET_EXCEEDED";
export class AiError extends Error {
  constructor(public readonly code: AiErrorCode) {
    super(code);
    this.name = "AiError";
  }
}
