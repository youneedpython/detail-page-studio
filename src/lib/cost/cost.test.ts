// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BudgetGuard, estimateCostUsd, JsonUsageStore, MemoryUsageStore } from "./index";

describe("cost", () => {
  it("uses approved input and output prices", () => {
    expect(estimateCostUsd({ input: 1_000_000, output: 1_000_000 })).toBe(24);
    expect(estimateCostUsd({ input: 0, output: 0 })).toBe(0);
    expect(() => estimateCostUsd({ input: -1, output: 0 })).toThrow();
  });
  it("blocks at the limit and resets by UTC calendar month", async () => {
    let date = new Date("2026-11-30T23:59:59Z");
    const store = new MemoryUsageStore();
    const guard = new BudgetGuard(store, 4, () => date);
    await guard.assertAvailable();
    await guard.record({ input: 1_000_000, output: 0 });
    await expect(guard.assertAvailable()).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    date = new Date("2026-12-01T09:00:00+09:00");
    await guard.assertAvailable();
    await guard.record({ input: 0, output: 1_000_000 });
    expect(await store.read("2026-11")).toBe(4);
    expect(await store.read("2026-12")).toBe(20);
    await expect(guard.assertAvailable()).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("reads the configured budget and rejects invalid configuration", async () => {
    vi.stubEnv("AI_MONTHLY_BUDGET_USD", "0");
    try {
      await expect(new BudgetGuard(new MemoryUsageStore()).assertAvailable()).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
      vi.stubEnv("AI_MONTHLY_BUDGET_USD", "");
      await expect(new BudgetGuard(new MemoryUsageStore()).assertAvailable()).resolves.toBeUndefined();
      vi.stubEnv("AI_MONTHLY_BUDGET_USD", "NaN");
      expect(() => new BudgetGuard(new MemoryUsageStore())).toThrow();
    } finally { vi.unstubAllEnvs(); }
  });
  it("persists monthly totals and serializes concurrent file updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-usage-"));
    try {
      const path = join(directory, "nested", "usage.json");
      const first = new JsonUsageStore(path);
      const second = new JsonUsageStore(path);
      expect(await first.read("2026-11")).toBe(0);
      await Promise.all([first.add("2026-11", 2), second.add("2026-11", 3), first.add("2026-12", 1)]);
      expect(await new JsonUsageStore(path).read("2026-11")).toBe(5);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ "2026-11": 5, "2026-12": 1 });
      await writeFile(path, "broken", "utf8");
      await expect(first.read("2026-11")).rejects.toThrow();
      await expect(new BudgetGuard(first).assertAvailable()).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
