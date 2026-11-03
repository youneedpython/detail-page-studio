import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftEditor } from "./draft-editor";
import * as storage from "../lib/client/draft-store";
vi.mock("../lib/client/photo-store", async importOriginal => { const actual = await importOriginal<typeof import("../lib/client/photo-store")>(); return { ...actual, getPhotoStore: async () => new actual.MemoryPhotoStore() }; });
const fixture: storage.SavedDraft = { id: "draft", productName: "가상 상품", createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z", sections: [{ id: "a", role: "hook", template: "hero", headline: "첫 제목", body: "첫 본문", bullets: [], imageSlot: null, imageGuide: "정면" }, { id: "b", role: "spec", template: "spec-table", headline: "스펙", body: "", bullets: [], imageSlot: null, imageGuide: "구성" }], warnings: ["검토 필요"], usage: { input: 0, output: 0, estimatedCostUsd: 0 } };
beforeEach(() => { localStorage.clear(); storage.saveDraft(fixture); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
test("경고, 즉시 미리보기와 500ms 자동 저장, 순서 / 삭제 / 추가", async () => {
  render(<DraftEditor id="draft" />); await screen.findByText("새로고침하면 사진이 사라집니다");
  expect(screen.getByText("검토 필요")).toBeInTheDocument();
  vi.useFakeTimers(); const save = vi.spyOn(storage, "saveDraft");
  fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: "수정 제목" } });
  expect(screen.getByRole("heading", { name: "수정 제목" })).toBeInTheDocument(); expect(save).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(500)); expect(save).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "섹션 1 아래로" }));
  expect(within(screen.getAllByRole("list")[1]).getAllByRole("listitem")[0]).toHaveTextContent("스펙");
  fireEvent.click(screen.getByRole("button", { name: "섹션 1 삭제" })); fireEvent.click(screen.getByRole("button", { name: "섹션 추가" }));
  expect(screen.getByRole("heading", { name: "새 섹션" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PNG 내보내기" })).toBeDisabled();
});
test("없는 초안은 빈 상태", async () => { render(<DraftEditor id="missing" />); expect(await screen.findByText("초안이 없습니다")).toBeInTheDocument(); });
test("길이 초과와 저장 실패를 표시하고 편집 문구는 보존한다", async () => {
  render(<DraftEditor id="draft" />); await screen.findByText("새로고침하면 사진이 사라집니다");
  vi.useFakeTimers(); vi.spyOn(storage, "saveDraft").mockReturnValue(false);
  const headline = "가".repeat(26); fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: headline } });
  expect(screen.getByText(/권장 길이 초과/)).toHaveClass("length-warning");
  act(() => vi.advanceTimersByTime(500)); expect(screen.getByText(/저장 실패/)).toBeInTheDocument(); expect(screen.getByRole("heading", { name: headline })).toBeInTheDocument();
});
