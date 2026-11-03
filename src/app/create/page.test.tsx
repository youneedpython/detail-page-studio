import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import CreatePage from "./input-page";
import { getDraft } from "../../lib/client/draft-store";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../lib/client/photo-store", async importOriginal => { const actual = await importOriginal<typeof import("../../lib/client/photo-store")>(); const memory = new actual.MemoryPhotoStore(); return { ...actual, getPhotoStore: async () => memory, storePhotos: async (id: string, photos: import("../../lib/client/photo-store").Photo[]) => { await memory.save(id, photos); return memory; } }; });
beforeEach(() => {
  localStorage.clear(); push.mockClear(); window.history.replaceState({}, "", "/create?report=sample");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:dummy"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test("필수 입력, 특징 추가 / 삭제, 참고 선택과 사진 설명 전송, 저장 후 이동", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "created", sections: [], warnings: [], usage: { input: 0, output: 0, estimatedCostUsd: 0 } }) })));
  render(<CreatePage />);
  expect(screen.getByRole("button", { name: "초안 생성" })).toBeDisabled();
  expect(screen.getByLabelText("참고 리포트")).toHaveValue("sample");
  fireEvent.change(screen.getByLabelText("상품명 (필수)"), { target: { value: "가상 상품" } });
  fireEvent.change(screen.getByLabelText("특징 1"), { target: { value: "내 특징" } });
  fireEvent.click(screen.getByRole("button", { name: "특징 추가" })); expect(screen.getByLabelText("특징 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "특징 2 삭제" }));
  fireEvent.change(screen.getByLabelText("사진 선택"), { target: { files: [new File(["dummy"], "local.png", { type: "image/png" })] } });
  fireEvent.change(screen.getByLabelText("사진 1 설명"), { target: { value: "흰 배경 정면컷" } });
  fireEvent.click(screen.getByRole("button", { name: "초안 생성" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/create/created"));
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
  expect(request.myImages).toEqual([{ index: 0, description: "흰 배경 정면컷" }]); expect(request.referenceReport.sections).toBeDefined();
  expect(JSON.stringify(request)).not.toContain("local.png"); expect(JSON.stringify(request)).not.toContain("blob:dummy");
  expect(getDraft("created")?.productName).toBe("가상 상품");
});
test("INVALID_REQUEST 오류 후 입력을 유지한다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: { code: "INVALID_REQUEST" } }) })));
  render(<CreatePage />); fireEvent.change(screen.getByLabelText("상품명 (필수)"), { target: { value: "상품" } }); fireEvent.change(screen.getByLabelText("특징 1"), { target: { value: "특징" } });
  fireEvent.click(screen.getByRole("button", { name: "초안 생성" })); expect(await screen.findByRole("alert")).toHaveTextContent("상품명, 특징과 사진 설명"); expect(screen.getByLabelText("상품명 (필수)")).toHaveValue("상품"); expect(push).not.toHaveBeenCalled();
});
test("사진 순서를 바꾸고 삭제하며 취소 시 늦은 응답을 저장하지 않는다", async () => {
  let complete: (value: unknown) => void = () => {};
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { complete = resolve; })));
  render(<CreatePage />);
  fireEvent.change(screen.getByLabelText("상품명 (필수)"), { target: { value: "상품" } }); fireEvent.change(screen.getByLabelText("특징 1"), { target: { value: "특징" } });
  // Each selected image owns a distinct URL, as in the browser.
  vi.mocked(URL.createObjectURL).mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  fireEvent.change(screen.getByLabelText("사진 선택"), { target: { files: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })] } });
  fireEvent.change(screen.getByLabelText("사진 1 설명"), { target: { value: "정면" } }); fireEvent.change(screen.getByLabelText("사진 2 설명"), { target: { value: "옆면" } });
  fireEvent.click(screen.getByRole("button", { name: "사진 2 위로" })); expect(screen.getByLabelText("사진 1 설명")).toHaveValue("옆면");
  fireEvent.click(screen.getByRole("button", { name: "사진 2 삭제" })); expect(screen.queryByLabelText("사진 2 설명")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "초안 생성" })); fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  complete({ ok: true, json: async () => ({ id: "late" }) });
  await waitFor(() => expect(screen.getByRole("button", { name: "초안 생성" })).toBeEnabled());
  expect(getDraft("late")).toBeUndefined(); expect(push).not.toHaveBeenCalled();
});
