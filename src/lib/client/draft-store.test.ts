import { beforeEach, expect, test, vi } from "vitest";
import { getDraft, listDrafts, removeDraft, saveDraft, type SavedDraft } from "./draft-store";
import { MemoryPhotoStore } from "./photo-store";
export const draftFixture: SavedDraft = {
  id: "draft", productName: "가상 텀블러", createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z",
  sections: [{ id: "s1", role: "hook", template: "hero", headline: "가상 상품 제목", body: "본문", bullets: ["용량: 500ml", "확인 안내"], imageSlot: null, imageGuide: "정면 사진" }, { id: "s2", role: "spec", template: "spec-table", headline: "스펙", body: "구성", bullets: ["용량: 500ml"], imageSlot: null, imageGuide: "구성 사진" }],
  warnings: ["게시 전 사실을 확인해 주세요"], usage: { input: 0, output: 0, estimatedCostUsd: 0 },
};
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
test("초안은 최신순 최대 20개, 중복 제거, 삭제, 사진 제외", () => {
  for (let i = 0; i < 22; i++) saveDraft({ ...draftFixture, id: String(i), updatedAt: new Date(2026, 0, i + 1).toISOString() });
  expect(listDrafts()).toHaveLength(20); expect(listDrafts()[0].id).toBe("21");
  saveDraft({ ...draftFixture, photos: ["must not persist"] } as SavedDraft);
  expect(localStorage.getItem("dps:drafts")).not.toContain("must not persist");
  expect(getDraft("draft")?.productName).toBe("가상 텀블러"); removeDraft("draft"); expect(getDraft("draft")).toBeUndefined();
});
test("손상된 데이터와 접근 제한을 처리한다", () => {
  localStorage.setItem("dps:drafts", "broken"); expect(listDrafts()).toEqual([]);
  localStorage.setItem("dps:drafts", JSON.stringify([{}, draftFixture])); expect(listDrafts()).toHaveLength(1);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(listDrafts()).toEqual([]); expect(saveDraft(draftFixture)).toBe(false); expect(() => removeDraft("draft")).not.toThrow();
});
test("메모리 사진 저장소는 초안별 Blob과 설명을 보존하고 교체 / 삭제한다", async () => {
  const store = new MemoryPhotoStore(); const blob = new Blob(["dummy"], { type: "image/png" });
  await store.save("a", [{ index: 0, blob, description: "정면" }]); await store.save("b", [{ index: 1, blob, description: "옆면" }]);
  expect(store.persistent).toBe(false); expect((await store.list("a"))[0]).toEqual({ index: 0, blob, description: "정면" });
  await store.save("a", []); expect(await store.list("a")).toEqual([]); expect(await store.list("b")).toHaveLength(1);
  await store.remove("b"); expect(await store.list("b")).toEqual([]);
});
