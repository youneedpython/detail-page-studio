import { AiError, type AiClient, type StructuredRequest, type StructuredResult } from "./types";

export type FakeResponse = StructuredResult<unknown> | AiError;
export type FakeResponder = (request: StructuredRequest<unknown>) => FakeResponse | Promise<FakeResponse>;

export class FakeAiClient implements AiClient {
  readonly calls: StructuredRequest<unknown>[] = [];
  private readonly responses: FakeResponse[] | FakeResponder;

  constructor(responses: FakeResponse[] | FakeResponder = []) {
    this.responses = Array.isArray(responses) ? [...responses] : responses;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(request);
    const response = typeof this.responses === "function"
      ? await this.responses(request) : this.responses.shift();
    if (response instanceof AiError) throw response;
    if (!response) throw new AiError("AI_UNAVAILABLE");
    const parsed = request.schema.safeParse(response.data);
    if (!parsed.success) throw new AiError("AI_INVALID_OUTPUT");
    return { data: parsed.data, usage: response.usage };
  }
}
