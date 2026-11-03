import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AnalyzePage from "./page";
import { sampleReport } from "../../lib/client/sample-report";
import { getReport } from "../../lib/client/report-store";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
beforeEach(() => { localStorage.clear(); push.mockClear(); vi.stubGlobal("fetch", vi.fn()); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${Math.random()}`), revokeObjectURL: vi.fn() })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function select() { fireEvent.change(screen.getByLabelText("이미지 선택"), { target: { files: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })] } }); }
test("파일 없는 요청을 막고 순서 변경과 삭제를 지원한다", () => {
  render(<AnalyzePage />); expect(screen.getByRole("button", { name: "분석 요청" })).toBeDisabled(); select();
  fireEvent.click(screen.getByRole("button", { name: "b.png 위로" })); expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("b.png");
  fireEvent.click(screen.getByRole("button", { name: "b.png 삭제" })); expect(screen.getAllByRole("listitem")).toHaveLength(1);
});
test("성공 시 선택한 순서로 전송하고 저장 후 이동한다", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...sampleReport, id: "result" })); render(<AnalyzePage />); select(); fireEvent.click(screen.getByRole("button", { name: "분석 요청" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/analyze/result")); expect(getReport("result")).toBeDefined();
  const form = vi.mocked(fetch).mock.calls[0][1]?.body as FormData; expect(form.getAll("images").map(item => (item as File).name)).toEqual(["a.png", "b.png"]);
});
test("오류 코드 안내 뒤에도 이미지를 유지하고 다시 시도한다", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: { code: "BUDGET_EXCEEDED" } }, { status: 429 })); render(<AnalyzePage />); select(); fireEvent.click(screen.getByRole("button", { name: "분석 요청" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("이번 달 AI 사용 한도"); expect(screen.getAllByRole("listitem")).toHaveLength(2); expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
});
test("취소는 요청을 중단하고 늦게 도착한 성공으로 이동하지 않는다", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve; })); render(<AnalyzePage />); select(); fireEvent.click(screen.getByRole("button", { name: "분석 요청" })); fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true); finish(Response.json(sampleReport));
  await screen.findByRole("button", { name: "다시 시도" }); expect(push).not.toHaveBeenCalled(); expect(screen.getAllByRole("listitem")).toHaveLength(2);
});
