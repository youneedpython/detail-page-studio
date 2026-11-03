import { z } from "zod";
import { draftOutputSchema, type DetailDraft } from "../generation/schema";

// Editing may add or remove sections beyond the generator's initial 5–10 sections.
const schema = z.object({
  id: z.string(), productName: z.string(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  sections: z.array(draftOutputSchema.shape.sections.element.extend({ id: z.string() })),
  warnings: z.array(z.string()),
  usage: z.object({ input: z.number(), output: z.number(), estimatedCostUsd: z.number() }),
});
export type SavedDraft = DetailDraft & { productName: string; createdAt: string; updatedAt: string };
export function listDrafts(): SavedDraft[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem("dps:drafts") ?? "[]");
    return Array.isArray(values) ? values.flatMap(value => { const result = schema.safeParse(value); return result.success ? [result.data] : []; }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20) : [];
  } catch { return []; }
}
export function saveDraft(draft: SavedDraft): boolean {
  try {
    const clean = schema.parse(draft);
    localStorage.setItem("dps:drafts", JSON.stringify([clean, ...listDrafts().filter(item => item.id !== clean.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20)));
    return true;
  } catch { return false; }
}
export function getDraft(id: string) { return listDrafts().find(item => item.id === id); }
export function removeDraft(id: string) {
  try { localStorage.setItem("dps:drafts", JSON.stringify(listDrafts().filter(item => item.id !== id))); } catch { /* Storage unavailable. */ }
}
