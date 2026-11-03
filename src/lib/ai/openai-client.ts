import OpenAI from "openai";
import { LengthFinishReasonError, ContentFilterFinishReasonError } from "openai/core/error";
import { zodTextFormat } from "openai/helpers/zod";
import { AiError, type AiClient, type StructuredRequest, type StructuredResult } from "./types";

export const OPENAI_MODEL = "gpt-6-luna";
export type OpenAiTransport = Pick<OpenAI, "responses">;

export class OpenAiAiClient implements AiClient {
  constructor(private readonly client: OpenAiTransport = new OpenAI({ maxRetries: 0 })) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    try {
      const response = await this.client.responses.parse({
        model: OPENAI_MODEL,
        instructions: request.system,
        input: [{ role: "user", content: request.content.map(part => part.type === "text"
          ? { type: "input_text" as const, text: part.text }
          : { type: "input_image" as const, image_url: `data:${part.mediaType};base64,${part.base64}`, detail: "high" as const }) }],
        text: { format: zodTextFormat(request.schema, "output") },
        reasoning: { effort: request.effort ?? "medium" },
        ["max_output_" + "tokens"]: request.maxTokens ?? 16000,
      });
      if (response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))) {
        throw new AiError("AI_REFUSED");
      }
      if (response.status !== "completed" || response.output_parsed == null) throw new AiError("AI_INVALID_OUTPUT");
      const parsed = request.schema.safeParse(response.output_parsed);
      if (!parsed.success) throw new AiError("AI_INVALID_OUTPUT");
      if (!response.usage) throw new AiError("AI_INVALID_OUTPUT");
      return { data: parsed.data, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new AiError("AI_TIMEOUT");
      if (error instanceof OpenAI.RateLimitError || error instanceof OpenAI.InternalServerError || error instanceof OpenAI.APIConnectionError) throw new AiError("AI_UNAVAILABLE");
      if (error instanceof LengthFinishReasonError) throw new AiError("AI_INVALID_OUTPUT");
      if (error instanceof ContentFilterFinishReasonError) throw new AiError("AI_REFUSED");
      throw error;
    }
  }
}
