import type { FakeResponder } from "../ai/fake-client";
import { templates, type DraftOutput } from "./schema";

export const sampleDraftResponder: FakeResponder = () => {
  const roles = ["hook", "solution", "differentiator", "spec", "shipping", "cta"] as const;
  const data: DraftOutput = { sections: templates.map((template, index) => ({
    role: roles[index], template, headline: index === 0 ? "데일리 텀블러 500ml" : "매일의 음료를 위한 선택",
    body: "가상 상품의 로컬 개발용 샘플 초안입니다.",
    bullets: template === "spec-table" ? ["용량: 500ml"] : ["[확인 필요: 상품 특징]", "[확인 필요: 사용 안내]", "[확인 필요: 배송 조건]"],
    imageSlot: null, imageGuide: "내 텀블러의 제품 사진을 준비하세요.",
  })) };
  return { data, usage: { input: 1000, output: 500 } };
};
