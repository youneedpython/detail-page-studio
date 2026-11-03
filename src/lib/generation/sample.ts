import type { FakeResponder } from "../ai/fake-client";
import type { DraftOutput } from "./schema";

interface SampleInput { product?: { name?: string; features?: string[] }; myImages?: Array<{ index: number }> }

// Reads the JSON payload that buildGenerationText puts after its first line, so the
// fake-mode draft reflects what the user typed instead of a fixed product.
function readInput(text: string | undefined): SampleInput {
  try { return JSON.parse(text?.slice(text.indexOf("\n") + 1) ?? "{}") as SampleInput; } catch { return {}; }
}

export const sampleDraftResponder: FakeResponder = request => {
  const first = request.content[0];
  const input = readInput(first?.type === "text" ? first.text : undefined);
  const name = input.product?.name?.trim() || "데일리 텀블러 500ml";
  const features = input.product?.features?.filter(feature => feature.trim()).slice(0, 5) ?? [];
  const highlights = features.length ? features : ["원터치 잠금 뚜껑", "500ml 넉넉한 용량", "분리 세척 가능한 구조"];
  const photo = (index: number) => (input.myImages?.some(image => image.index === index) ? index : null);
  const data: DraftOutput = { sections: [
    { role: "hook", template: "hero", headline: name, body: "매일 들고 다니고 싶은 이유를 담았어요.", bullets: [], imageSlot: photo(0), imageGuide: "흰 배경의 정면 제품컷" },
    { role: "problem", template: "image-text", headline: "이런 불편, 겪어 보셨나요?", body: "바쁜 하루 중에 생기는 작은 불편을 줄이는 데서 시작했습니다.", bullets: [], imageSlot: photo(1), imageGuide: "실제 사용 장면이나 불편 상황을 보여 주는 사진" },
    { role: "solution", template: "feature-list", headline: "이렇게 달라집니다", body: "", bullets: highlights, imageSlot: null, imageGuide: "핵심 기능을 확대한 디테일컷" },
    { role: "spec", template: "spec-table", headline: "상세 정보", body: "", bullets: ["상품명: " + name, "구성: [확인 필요: 구성품]", "소재: [확인 필요: 소재]"], imageSlot: photo(2), imageGuide: "치수가 보이는 정면 / 측면 사진" },
    { role: "shipping", template: "notice", headline: "배송 · 교환 안내", body: "", bullets: ["[확인 필요: 출고 기준]", "[확인 필요: 교환 / 반품 조건]"], imageSlot: null, imageGuide: "" },
    { role: "cta", template: "cta", headline: "오늘부터 함께하세요", body: name + "와 함께 더 가벼운 하루를 시작해 보세요.", bullets: [], imageSlot: photo(0), imageGuide: "대표 제품컷 또는 옵션별 컷" },
  ] };
  return { data, usage: { input: 1000, output: 500 } };
};
