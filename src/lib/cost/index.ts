import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { AiError, type AiUsage } from "../ai/types";

export const INPUT_USD_PER_MILLION = 4;
export const OUTPUT_USD_PER_MILLION = 20;

export function estimateCostUsd(usage: AiUsage): number {
  if (![usage.input, usage.output].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Invalid AI usage");
  }
  return (usage.input * INPUT_USD_PER_MILLION + usage.output * OUTPUT_USD_PER_MILLION) / 1_000_000;
}

export interface UsageStore {
  read(month: string): Promise<number>;
  add(month: string, amount: number): Promise<void>;
}

export class MemoryUsageStore implements UsageStore {
  private readonly amounts = new Map<string, number>();
  async read(month: string): Promise<number> { return this.amounts.get(month) ?? 0; }
  async add(month: string, amount: number): Promise<void> {
    this.amounts.set(month, (this.amounts.get(month) ?? 0) + amount);
  }
}

// Serialize updates across store instances for the same file in this process.
const pending = new Map<string, Promise<void>>();
export class JsonUsageStore implements UsageStore {
  private readonly path: string;
  constructor(path = ".data/usage.json") { this.path = resolve(path); }

  private async load(): Promise<Record<string, number>> {
    let text: string;
    try { text = await readFile(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data) ||
      !Object.entries(data).every(([month, amount]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
        typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) {
      throw new Error("Invalid usage store");
    }
    return data as Record<string, number>;
  }

  async read(month: string): Promise<number> {
    await pending.get(this.path);
    return (await this.load())[month] ?? 0;
  }

  async add(month: string, amount: number): Promise<void> {
    const previous = pending.get(this.path) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const amounts = await this.load();
      amounts[month] = (amounts[month] ?? 0) + amount;
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(amounts), "utf8");
      await rename(temporary, this.path);
    });
    pending.set(this.path, operation);
    try { await operation; }
    finally { if (pending.get(this.path) === operation) pending.delete(this.path); }
  }
}

export class BudgetGuard {
  constructor(
    private readonly store: UsageStore,
    private readonly limit = Number(process.env.AI_MONTHLY_BUDGET_USD ?? 30),
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isFinite(limit) || limit < 0) throw new Error("Invalid monthly AI budget");
  }
  private month(): string { return this.now().toISOString().slice(0, 7); }
  async assertAvailable(): Promise<void> {
    if (await this.store.read(this.month()) >= this.limit) throw new AiError("BUDGET_EXCEEDED");
  }
  async record(usage: AiUsage): Promise<void> {
    await this.store.add(this.month(), estimateCostUsd(usage));
  }
}
