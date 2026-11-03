import { beforeEach, expect, test, vi } from "vitest";
import { getReport, listReports, removeReport, saveReport } from "./report-store";
import { sampleReport } from "./sample-report";
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
test("저장은 최신순으로 중복 없이 최대 20개를 유지한다", () => {
  for (let index = 0; index < 22; index++) saveReport({ ...sampleReport, id: String(index), createdAt: new Date(2026, 0, index + 1).toISOString() });
  expect(listReports()).toHaveLength(20); expect(listReports()[0].id).toBe("21");
  saveReport({ ...sampleReport, id: "21", createdAt: new Date(2026, 0, 22).toISOString() }); expect(listReports()).toHaveLength(20);
  expect(getReport("21")?.id).toBe("21"); removeReport("21"); expect(getReport("21")).toBeUndefined();
});
test("저장소 오류와 손상된 JSON은 화면에 전파하지 않는다", () => {
  localStorage.setItem("dps:reports", "broken"); expect(listReports()).toEqual([]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
  expect(listReports()).toEqual([]); expect(() => saveReport(sampleReport)).not.toThrow(); expect(() => removeReport("sample")).not.toThrow();
});
