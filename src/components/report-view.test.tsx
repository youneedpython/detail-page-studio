import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { sampleReport } from "../lib/client/sample-report";
import { getSessionImages } from "../lib/client/session-images";
vi.mock("../lib/client/session-images", () => ({ getSessionImages: vi.fn(() => []) }));
import { ReportView } from "./report-view";
afterEach(() => { cleanup(); vi.mocked(getSessionImages).mockReset().mockReturnValue([]); });
test("예시 리포트의 점수, 체크리스트, 역할과 이미지 안내를 표시한다", () => {
  render(<ReportView id="sample" />);
  expect(screen.getByText("총점 42 / 60점")).toBeInTheDocument();
  expect(screen.getAllByRole("meter")).toHaveLength(6);
  expect(screen.getAllByText(/^(있음|없음) ·/)).toHaveLength(10);
  expect(screen.getByRole("button", { name: "1. 후킹" })).toBeInTheDocument();
  expect(screen.getByText("원본 이미지는 저장하지 않아 새로고침 후에는 볼 수 없습니다")).toBeInTheDocument();
});
test("없는 리포트는 새 분석과 예시를 안내한다", () => {
  render(<ReportView id="missing" />); expect(screen.getByRole("heading", { name: "리포트를 찾을 수 없습니다" })).toBeInTheDocument(); expect(screen.getByRole("link", { name: "예시 보기" })).toHaveAttribute("href", "/analyze/sample");
});

test("여러 조각과 여러 원본의 마커를 매핑하고 카드와 타임라인에서 이동한다", () => {
  vi.mocked(getSessionImages).mockReturnValue(["blob:first", "blob:second"]);
  const original = sampleReport.sections;
  sampleReport.sections = [
    { ...original[0], sourceSlice: { index: 1, top: 1320, bottom: 2720 } },
    { ...original[1], sourceSlice: { index: 4, top: 5280, bottom: 6000 } },
    { ...original[2], sourceSlice: { index: 6, top: 2640, bottom: 5440 } },
  ];
  try {
    render(<ReportView id="sample" />);
    const images = screen.getAllByRole("img");
    // Load the second capture first: its global offset is not known yet.
    Object.defineProperties(images[1], { naturalWidth: { value: 1720 }, naturalHeight: { value: 6000 } });
    fireEvent.load(images[1]);
    expect(document.getElementById("marker-2")).toBeNull();
    Object.defineProperties(images[0], { naturalWidth: { value: 860 }, naturalHeight: { value: 6000 } });
    fireEvent.load(images[0]);
    const markers = [0, 1, 2].map(index => document.getElementById(`marker-${index}`)!);
    expect(markers[0].parentElement).toBe(images[0].parentElement);
    expect(markers[1].parentElement).toBe(images[0].parentElement);
    expect(markers[2].parentElement).toBe(images[1].parentElement);
    expect(markers.map(marker => marker.style.top)).toEqual(["22%", "88%", "44%"]);
    const scroll = vi.fn();
    markers[2].scrollIntoView = scroll;
    fireEvent.click(screen.getByText(original[2].title));
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    markers[1].scrollIntoView = scroll;
    fireEvent.click(screen.getByRole("button", { name: /^2\./ }));
    expect(scroll).toHaveBeenCalledTimes(2);
  } finally { sampleReport.sections = original; }
});
