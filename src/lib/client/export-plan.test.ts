import { expect, test } from "vitest";
import { countPlaceholders, exportFileName, planExport } from "./export-plan";

test("height boundaries, oversized sections, empty input and order", () => {
  expect(planExport([])).toEqual([]);
  expect(planExport([8000, 8000, 1])).toEqual([[0, 1], [2]]);
  expect(planExport([16001, 10, 20])).toEqual([[0], [1, 2]]);
  expect(planExport([2, 3, 4, 1], 5)).toEqual([[0, 1], [2, 3]]);
});
test("safe single, split and section names", () => {
  expect(exportFileName('  a\\/:*?"<>|b  ')).toBe("ab.png");
  expect(exportFileName(" / ")).toBe("detail-page.png");
  expect(exportFileName("상품", 1, 3)).toBe("상품-1of3.png");
  expect(exportFileName("상품", 2, "section")).toBe("상품-section-02.png");
});
test("counts repeated markers across fields and empty photo slots", () => {
  expect(countPlaceholders([{ id: "a", role: "hook", template: "hero", headline: "[확인 필요: 제목]", body: "[확인 필요: 하나] [확인 필요: 둘]", bullets: ["[확인 필요: 항목]"], imageGuide: "가이드", imageSlot: null }])).toEqual({ text: 4, images: 1 });
  expect(countPlaceholders([])).toEqual({ text: 0, images: 0 });
});
