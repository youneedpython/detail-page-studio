import { expect, test, vi } from "vitest";
import { getSessionImages, setSessionImages } from "./session-images";
test("새 분석은 이전 이미지 URL을 해제하고 현재 리포트에만 원본을 제공한다", () => {
  const create = vi.fn().mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new");
  const revoke = vi.fn(); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  setSessionImages("old", [new File(["a"], "a.png")]); expect(getSessionImages("old")).toEqual(["blob:old"]);
  setSessionImages("new", [new File(["b"], "b.png")]); expect(revoke).toHaveBeenCalledWith("blob:old"); expect(getSessionImages("old")).toEqual([]); expect(getSessionImages("new")).toEqual(["blob:new"]); vi.unstubAllGlobals();
});
