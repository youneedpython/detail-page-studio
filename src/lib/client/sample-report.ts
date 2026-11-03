import { checklistItems, scoreCriteria, type AnalysisReport } from "../analysis/schema";
export const sampleReport: AnalysisReport = {
  id: "sample", createdAt: "2026-11-03T00:00:00.000Z", summary: "데일리 텀블러 500ml — 일상 휴대부터 사용과 관리까지 안내하는 가상 상품 예시입니다.", target: "음료를 휴대하는 직장인", tone: "간결하고 편안한 생활형",
  sections: (["hook", "problem", "solution", "spec", "usage", "cta"] as const).map((role, index) => ({
    order: index, role, title: ["하루를 함께하는 텀블러", "이동 중 음료 휴대", "가볍게 챙기는 일상", "500ml 용량과 구성", "사용 후 관리", "내 일상에 맞는 선택"][index],
    keyCopy: ["데일리 텀블러 500ml"], copyPattern: "일상 공감 → 상품 정보 → 행동 안내", appealPoints: ["일상 휴대", "용량을 한눈에 확인"],
    visuals: [{ kind: "product_cutout", composition: "밝은 배경에 제품을 중앙 배치", purpose: "제품 형태와 크기를 소개" }], myImageGuide: "내 상품의 흰 배경 제품컷과 손에 든 크기 비교컷을 준비하세요.", sourceSlice: { index: 0, top: index * 600, bottom: (index + 1) * 600 },
  })),
  checklist: checklistItems.map((item, index) => ({ item, present: index % 3 !== 1, note: "가상 상품 예시의 섹션 구성을 기준으로 확인했습니다." })),
  scores: scoreCriteria.map(criterion => ({ criterion, score: 7, max: 10, reason: "예시의 상품 소개와 사용 안내를 기준으로 한 참고 점수입니다." })),
  suggestions: ["첫 화면에 내 상품의 대표 혜택을 구체적으로 적어 주세요.", "스펙 아래에 내 상품의 실제 사용 사진을 배치하세요.", "마지막에 배송과 교환 조건을 안내하세요."], usage: { input: 0, output: 0, estimatedCostUsd: 0 },
};
