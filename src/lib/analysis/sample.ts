import type { FakeResponder } from "../ai/fake-client";
import { checklistItems, scoreCriteria, type AnalysisOutput } from "./schema";

export const sampleAnalysisResponder: FakeResponder = request => {
  const count = request.content.filter(block => block.type === "image").length;
  const data: AnalysisOutput = {
    summary: "가상 상품 데일리 텀블러 500ml의 로컬 개발용 샘플 리포트입니다.",
    target: "음료를 휴대하는 직장인", tone: "간결하고 편안한 생활형",
    sections: ["일상에 함께하는 텀블러", "500ml 용량 안내"].map((title, index) => ({
      order: index, role: index === 0 ? "hook" : "spec", title,
      keyCopy: index === 0 ? ["데일리 텀블러 500ml"] : ["500ml"],
      copyPattern: "상품 소개 → 용량 정보", appealPoints: ["일상 휴대"],
      visuals: [{ kind: "product_cutout", composition: "밝은 배경의 제품 중앙 배치", purpose: "제품 형태 소개" }],
      myImageGuide: "내 텀블러의 흰 배경 제품컷과 손에 든 크기 비교컷을 준비하세요.",
      sliceIndex: Math.min(index, Math.max(0, count - 1)),
    })),
    checklist: checklistItems.map(item => ({ item, present: item === "상세 스펙", note: "가상 샘플 기준이며 실제 업로드 분석이 아닙니다." })),
    scores: scoreCriteria.map(criterion => ({ criterion, score: 5, max: 10, reason: "샘플의 상품 소개와 용량 섹션을 기준으로 한 예시 점수입니다." })),
    suggestions: ["첫 화면에 내 상품의 대표 혜택을 한 줄로 추가하세요.", "스펙 아래에 내 상품의 실제 사용 사진을 배치하세요.", "마지막 섹션에 배송과 교환 조건을 명확하게 안내하세요."],
  };
  return { data, usage: { input: 1000, output: 500 } };
};
