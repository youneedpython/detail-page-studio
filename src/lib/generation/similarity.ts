export interface DraftText { section: number; field: string; text: string }
export interface CopiedSpan { section: number; field: string; span: string }
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}]/gu, "");
}

export function findCopiedSpans(draftTexts: DraftText[], referenceCopies: string[], ownTexts: string[], minLength = 12): CopiedSpan[] {
  if (!Number.isInteger(minLength) || minLength < 1) throw new RangeError("Invalid minimum length");
  const own = ownTexts.map(normalizeText);
  const references = referenceCopies.map(value => Array.from(normalizeText(value)));
  const violations: CopiedSpan[] = [];
  for (const { section, field, text } of draftTexts) {
    const chars = Array.from(normalizeText(text));
    const spans = new Set<string>();
    for (const ref of references) {
      // Walk matching diagonals: every common run is considered once.
      for (let offset = 1 - ref.length; offset < chars.length; offset++) {
        let run: string[] = [];
        const flush = () => {
          const span = run.join("");
          if (run.length >= minLength && !own.some(value => value.includes(span))) spans.add(span);
          run = [];
        };
        for (let j = Math.max(0, -offset); j < ref.length && j + offset < chars.length; j++) {
          if (ref[j] === chars[j + offset]) run.push(ref[j]); else flush();
        }
        flush();
      }
    }
    for (const span of spans) violations.push({ section, field, span });
  }
  return violations;
}
