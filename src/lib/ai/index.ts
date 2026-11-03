import { BudgetGuard, JsonUsageStore, MemoryUsageStore } from "../cost";
import { AnthropicAiClient } from "./anthropic-client";
import { FakeAiClient, type FakeResponder, type FakeResponse } from "./fake-client";
import type { AiClient, StructuredRequest, StructuredResult } from "./types";
import { AiError } from "./types";

export * from "./types";
export { AnthropicAiClient, FakeAiClient };

export class GuardedAiClient implements AiClient {
  constructor(private readonly client: AiClient, private readonly guard: BudgetGuard) {}
  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await this.guard.assertAvailable();
    const result = await this.client.generateStructured(request);
    await this.guard.record(result.usage);
    return result;
  }
}

export function createAiClient(responses: FakeResponse[] | FakeResponder = []): GuardedAiClient {
  const fake = process.env.AI_CLIENT === "fake";
  if (!fake && !process.env.ANTHROPIC_API_KEY?.trim()) throw new AiError("AI_NOT_CONFIGURED");
  return new GuardedAiClient(
    fake ? new FakeAiClient(responses) : new AnthropicAiClient(),
    new BudgetGuard(fake ? new MemoryUsageStore() : new JsonUsageStore()),
  );
}
