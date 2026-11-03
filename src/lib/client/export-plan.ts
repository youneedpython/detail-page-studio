import type { DetailDraft } from "../generation/schema";

export function planExport(sectionHeights: number[], maxHeight = 16000): number[][] {
  const groups: number[][] = [];
  let height = 0;
  sectionHeights.forEach((value, index) => {
    if (!groups.length || (height + value > maxHeight && groups.at(-1)!.length)) {
      groups.push([]); height = 0;
    }
    groups.at(-1)!.push(index); height += value;
  });
  return groups;
}

// A section export uses the same part index and the explicit "section" mode.
export function exportFileName(productName: string, part = 1, total: number | "section" = 1): string {
  const name = productName.replace(/[\\/:*?"<>|]/g, "").trim() || "detail-page";
  return `${name}${total === "section" ? `-section-${String(part).padStart(2, "0")}` : total > 1 ? `-${part}of${total}` : ""}.png`;
}

export function countPlaceholders(sections: DetailDraft["sections"]) {
  return {
    text: sections.reduce((sum, section) => sum + [section.headline, section.body, ...section.bullets].reduce((n, text) => n + (text.match(/\[확인 필요:[^\]]*\]/g)?.length ?? 0), 0), 0),
    images: sections.filter(section => section.imageSlot === null).length,
  };
}
