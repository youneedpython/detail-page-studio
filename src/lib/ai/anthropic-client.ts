import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, type AiClient, type StructuredRequest, type StructuredResult } from "./types";

export const AI_MODEL = "claude-opus-5-5";
export type AnthropicTransport = Pick<Anthropic, "messages">;

export class AnthropicAiClient implements AiClient {
  constructor(private readonly client: AnthropicTransport = new Anthropic({ maxRetries: 0 })) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    try {
      const response = await this.client.messages.parse({
        model: AI_MODEL,
        ["max_tokens"]: request.maxTokens ?? 4096,
        system: request.system,
        messages: [{ role: "user", content: request.content.map((part) => part.type === "text"
          ? { type: "text" as const, text: part.text }
          : { type: "image" as const, source: { type: "base64" as const, media_type: part.mediaType, data: part.base64 } }) }],
        output_config: { format: zodOutputFormat(request.schema), effort: request.effort ?? "medium" },
      });
      if (response.stop_reason === "refusal") throw new AiError("AI_REFUSED");
      if (response.parsed_output == null) throw new AiError("AI_INVALID_OUTPUT");
      const parsed = request.schema.safeParse(response.parsed_output);
      if (!parsed.success) throw new AiError("AI_INVALID_OUTPUT");
      return { data: parsed.data, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("AI_TIMEOUT");
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
        throw new AiError("AI_UNAVAILABLE");
      }
      throw error;
    }
  }
}
