import { randomUUID } from "node:crypto";
import { AiError, type AiClient } from "../ai/types";
import { estimateCostUsd } from "../cost";
import { buildGenerationText, generationSystemPrompt } from "./prompt";
import { draftOutputSchema, generateRequestSchema, type DetailDraft, type DraftOutput } from "./schema";
import { findCopiedSpans } from "./similarity";

export interface GenerationDependencies { ai: AiClient }
export async function generateDraft(request: unknown, deps: GenerationDependencies): Promise<DetailDraft> {
  const input = generateRequestSchema.parse(request);
  const usage = { input: 0, output: 0 };
  const warnings: string[] = [];
  const original = buildGenerationText(input);
  let text = original;
  let output!: DraftOutput;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await deps.ai.generateStructured({ system: generationSystemPrompt,
      content: [{ type: "text", text }], schema: draftOutputSchema, effort: "medium" });
    usage.input += result.usage.input; usage.output += result.usage.output;
    const parsed = draftOutputSchema.safeParse(result.data);
    if (!parsed.success) throw new AiError("AI_INVALID_OUTPUT");
    output = parsed.data;
    const copied = findCopiedSpans(output.sections.flatMap((section, index) => [
      { section: index + 1, field: "headline", text: section.headline },
      { section: index + 1, field: "body", text: section.body },
      ...section.bullets.map((value, i) => ({ section: index + 1, field: `bullets[${i}]`, text: value })),
    ]), input.referenceReport?.sections.flatMap(section => section.keyCopy) ?? [], [input.product.name, ...input.product.features]);
    if (!copied.length) break;
    if (attempt === 0) text = `${original}\n다음은 복사 검사 결과 데이터입니다. 해당 구간을 피하여 전체 초안을 다시 작성하세요.\n${JSON.stringify(copied)}`;
    else warnings.push(...copied.map(item => `${item.section}번 섹션 ${item.field}: 경쟁 문구 유사 구간 "${item.span}"을 수정하세요.`));
  }
  const uses = new Map<number, number>();
  const placements = new Map<number, number | null>();
  // Reserve representative photos before allocating the other sections.
  const ordered = output.sections.map((section, index) => ({ section, index }))
    .sort((a, b) => Number(b.section.template === "hero") - Number(a.section.template === "hero"));
  for (const { section, index } of ordered) {
    let imageSlot = input.myImages.some(image => image.index === section.imageSlot) ? section.imageSlot : null;
    if (imageSlot !== null && (uses.get(imageSlot) ?? 0) >= 2) imageSlot = null;
    if (section.template === "hero" && imageSlot === null) imageSlot = input.myImages.find(image => (uses.get(image.index) ?? 0) < 2)?.index ?? null;
    if (imageSlot !== null) uses.set(imageSlot, (uses.get(imageSlot) ?? 0) + 1);
    placements.set(index, imageSlot);
    if (section.template === "hero" && input.myImages.length && imageSlot === null) warnings.push(`${index + 1}번 섹션: 대표 사진 배치가 필요합니다.`);
  }
  const sections = output.sections.map((section, index) => {
    const fields = [{ field: "headline", text: section.headline, limit: 25 }, { field: "body", text: section.body, limit: 120 },
      ...section.bullets.map((text, i) => ({ field: `bullets[${i}]`, text, limit: 40 }))];
    for (const item of fields) {
      if (Array.from(item.text).length > item.limit) warnings.push(`${index + 1}번 섹션 ${item.field}: ${item.limit}자 길이 제한을 초과했습니다.`);
      for (const word of ["최고", "최초", "1위", "100%", "완벽"]) if (item.text.includes(word)) warnings.push(`${index + 1}번 섹션 ${item.field}: 금지 표현 "${word}"을 수정하세요.`);
    }
    return { ...section, id: randomUUID(), imageSlot: placements.get(index) ?? null };
  });
  return { id: randomUUID(), sections, warnings, usage: { ...usage, estimatedCostUsd: estimateCostUsd(usage) } };
}
