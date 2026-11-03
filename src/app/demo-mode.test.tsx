import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import AnalyzePage from "./analyze/page";
import CreatePage from "./create/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../lib/client/photo-store", () => ({ getPhotoStore: async () => ({ persistent: true }) }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test.each(["fake", undefined, "anthropic"])("서버 환경 %s에 따라 두 입력 화면의 배너를 표시한다", mode => {
  vi.stubEnv("AI_CLIENT", mode);
  for (const Page of [AnalyzePage, CreatePage]) {
    render(Page());
    const banner = screen.queryByText("체험 모드: 실제 AI 대신 예시 결과를 보여 줍니다");
    if (mode === "fake") expect(banner).toBeInTheDocument();
    else expect(banner).not.toBeInTheDocument();
    cleanup();
  }
});
