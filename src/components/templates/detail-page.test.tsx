import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { templates } from "../../lib/generation/schema";
import { DetailPage, type DetailSection } from "./detail-page";
afterEach(cleanup);
test("6종 템플릿, 자리 표시, 표와 확인 필요 강조를 렌더링한다", () => {
  const sections: DetailSection[] = templates.map((template, i) => ({ id: String(i), role: "other", template, headline: template, body: "[확인 필요: 재질]", bullets: ["용량: 500ml", "안내"], imageSlot: null, imageGuide: "내 상품 정면 사진" }));
  const { container } = render(<DetailPage sections={sections} />);
  expect(container.querySelector("[data-detail-page]")).toBeInTheDocument(); expect(screen.getAllByRole("heading")).toHaveLength(6);
  expect(screen.getAllByText("내 상품 정면 사진")).toHaveLength(6); expect(container.querySelectorAll("mark")).toHaveLength(6);
  expect(screen.getByRole("rowheader", { name: "용량" })).toBeInTheDocument(); expect(screen.getByRole("cell", { name: "500ml" })).toBeInTheDocument();
  expect(screen.getAllByRole("cell", { name: "안내" })[0]).toHaveAttribute("colspan", "2");
});
test("내 사진 URL이 있으면 가이드 상자를 사진으로 바꾼다", () => {
  render(<DetailPage sections={[{ id: "a", role: "hook", template: "hero", headline: "상품", body: "", bullets: [], imageSlot: 0, imageGuide: "정면" }]} photoUrls={{ 0: "blob:local" }} />);
  expect(screen.getByRole("img", { name: "정면" })).toHaveAttribute("src", "blob:local");
});
