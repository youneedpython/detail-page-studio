import { afterEach, expect, test, vi } from "vitest";
import { toBlob } from "html-to-image";
import { exportPng } from "./export-png";
vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ""; });
test("splits ordered groups, downloads each blob and restores the export DOM", async () => {
  vi.useFakeTimers();
  vi.mocked(toBlob).mockResolvedValue(new Blob());
  const create = vi.fn(() => "blob:export"); const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) { names.push(this.download); });
  const root = document.createElement("div"); root.innerHTML = '<div data-detail-page><section></section><section></section></div>'; document.body.append(root);
  root.querySelectorAll("section").forEach(section => vi.spyOn(section, "getBoundingClientRect").mockReturnValue({ height: 9000 } as DOMRect));
  const job = exportPng(root, "상품", "all"); await vi.runAllTimersAsync();
  expect(await job).toBe(2); expect(names).toEqual(["상품-1of2.png", "상품-2of2.png"]);
  expect(toBlob).toHaveBeenCalledWith(root.firstElementChild, expect.objectContaining({ width: 860, pixelRatio: 1, backgroundColor: "#ffffff" }));
  expect(create).toHaveBeenCalledTimes(2); expect(revoke).toHaveBeenCalledTimes(2);
  expect(root.hasAttribute("data-exporting")).toBe(false);
  expect(Array.from(root.querySelectorAll("section")).every(section => !section.hidden)).toBe(true);
  vi.unstubAllGlobals();
});
test("conversion errors restore hidden sections and export styles", async () => {
  vi.mocked(toBlob).mockRejectedValue(new Error("failed"));
  const root = document.createElement("div"); root.innerHTML = '<div data-detail-page><section></section><section></section></div>';
  await expect(exportPng(root, "상품", "sections")).rejects.toThrow("failed");
  expect(root.hasAttribute("data-exporting")).toBe(false);
  expect(root.querySelector<HTMLElement>("section")!.hidden).toBe(false);
});
test("marks each image's first section and survives photos that fail to decode", async () => {
  const seen: string[] = [];
  vi.mocked(toBlob).mockImplementation(async element => {
    seen.push(Array.from((element as HTMLElement).children).map(section => section.hasAttribute("data-export-first") ? "first" : "-").join(","));
    return new Blob();
  });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.innerHTML = '<div data-detail-page><section><img src="blob:gone"></section><section></section></div>';
  // jsdom has no HTMLImageElement.decode; define one that fails like a revoked Object URL.
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: () => Promise.reject(new Error("revoked")) });
  await expect(exportPng(root, "상품", "sections")).resolves.toBe(2);
  expect(seen).toEqual(["first,-", "-,first"]);
  expect(root.querySelector("[data-export-first]")).toBeNull();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  vi.unstubAllGlobals();
});
