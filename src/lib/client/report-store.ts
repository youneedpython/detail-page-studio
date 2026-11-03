import { z } from "zod";
import { analysisOutputSchema, type AnalysisReport } from "../analysis/schema";

const reportSchema = analysisOutputSchema.omit({ sections: true }).extend({
  id: z.string(), createdAt: z.iso.datetime(),
  sections: z.array(analysisOutputSchema.shape.sections.element.omit({ sliceIndex: true }).extend({ sourceSlice: z.object({ index: z.number().int().nonnegative(), top: z.number().nonnegative(), bottom: z.number().nonnegative() }) })),
  usage: z.object({ input: z.number(), output: z.number(), estimatedCostUsd: z.number() }),
});

const REPORTS_SLOT = "dps:reports";
export function listReports(): AnalysisReport[] {
  try {
    const reports: unknown = JSON.parse(localStorage.getItem(REPORTS_SLOT) ?? "[]");
    if (!Array.isArray(reports)) return [];
    return reports.flatMap(report => { const parsed = reportSchema.safeParse(report); return parsed.success ? [parsed.data] : []; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  } catch { return []; }
}
export function saveReport(report: AnalysisReport) {
  try { const clean = reportSchema.parse(report); localStorage.setItem(REPORTS_SLOT, JSON.stringify([clean, ...listReports().filter(item => item.id !== clean.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20))); } catch { /* Storage may be disabled or full. */ }
}
export function getReport(id: string) { return listReports().find(report => report.id === id); }
export function removeReport(id: string) {
  try { localStorage.setItem(REPORTS_SLOT, JSON.stringify(listReports().filter(report => report.id !== id))); } catch { /* Keep the screen usable. */ }
}
