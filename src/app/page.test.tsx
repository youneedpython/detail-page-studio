import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import Home from "./page";
import { saveReport } from "../lib/client/report-store";
import { sampleReport } from "../lib/client/sample-report";
import { saveDraft } from "../lib/client/draft-store";
beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("홈에서 서비스명, 두 작업 진입 경로와 빈 상태를 안내한다", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "Detail Page Studio", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "경쟁 상세페이지 분석" })).toHaveAttribute("href", "/analyze");
  expect(screen.getByRole("link", { name: "내 상세페이지 만들기" })).toHaveAttribute("href", "/create");
  expect(screen.getByText("아직 최근 작업이 없습니다.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "예시 리포트 보기" })).toHaveAttribute("href", "/analyze/sample");
});
test("저장된 최근 리포트와 총점을 보여준다", () => {
  saveReport({ ...sampleReport, id: "recent" }); render(<Home />);
  expect(screen.getByRole("link", { name: sampleReport.summary })).toHaveAttribute("href", "/analyze/recent"); expect(screen.getByText(/총점 42/)).toBeInTheDocument();
});
test("최근 초안을 구분해 편집기로 연결한다", () => {
  saveDraft({ id: "recent-draft", productName: "내 가상 상품", sections: [], warnings: [], usage: { input: 0, output: 0, estimatedCostUsd: 0 }, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" });
  render(<Home />); expect(screen.getByText("초안")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "내 가상 상품" })).toHaveAttribute("href", "/create/recent-draft"); expect(screen.queryByText("아직 최근 작업이 없습니다.")).not.toBeInTheDocument();
});
