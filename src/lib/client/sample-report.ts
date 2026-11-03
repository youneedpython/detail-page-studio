import { checklistItems, scoreCriteria, type AnalysisReport } from "../analysis/schema";
export const sampleReport: AnalysisReport = {
  id: "sample", createdAt: "2026-11-03T00:00:00.000Z", summary: "데일리 텀블러 500ml — 일상 휴대부터 사용과 관리까지 안내하는 가상 상품 예시입니다.", target: "음료를 휴대하는 직장인", tone: "간결하고 편안한 생활형",
  sections: ([
    ["hook", "하루를 함께하는 텀블러", ["출근부터 퇴근까지, 데일리 텀블러 500ml"], "질문형 공감 → 대표 혜택 한 줄", ["하루 종일 휴대", "가벼운 무게"], "lifestyle", "책상 위 노트북 옆에 제품을 두고 자연광으로 촬영", "일상에서 쓰는 장면으로 첫 화면 공감 유도", "책상 / 가방 등 실제 사용 장면에서 찍은 내 상품 사진 1장"],
    ["problem", "이동 중 음료 휴대의 불편", ["가방 속에서 새는 텀블러, 이제 그만"], "불편 상황 제시 → 공감", ["새는 문제", "세척 번거로움"], "comparison", "일반 텀블러와 나란히 놓고 차이를 표시", "기존 제품의 불편을 시각적으로 강조", "가방에 넣은 모습과 뚜껑 잠금 클로즈업 사진"],
    ["solution", "원터치 잠금 뚜껑", ["한 손으로 열고, 딸깍 잠그면 끝"], "기능 → 사용 장면", ["원터치 잠금", "누수 방지"], "detail_closeup", "뚜껑 부분을 크게 확대, 화살표로 동작 표시", "핵심 기능을 직관적으로 이해", "뚜껑 여닫는 동작을 연속으로 찍은 사진 2 ~ 3장"],
    ["spec", "500ml 용량과 구성", ["용량 500ml", "본체 / 뚜껑 / 실리콘 패킹"], "표 형태로 정리", ["용량을 한눈에 확인"], "infographic", "제품 단독컷 옆에 치수 / 용량 아이콘 배치", "구매 전 확인할 정보를 빠르게 전달", "흰 배경 누끼컷 1장 + 치수 표시용 정면컷"],
    ["usage", "사용 후 관리", ["분리 세척 3단계"], "순서형 안내", ["쉬운 세척"], "infographic", "번호를 붙인 3컷 가로 배치", "관리 부담을 낮춰 구매 망설임 해소", "분리한 부품을 나란히 놓은 사진"],
    ["cta", "내 일상에 맞는 선택", ["오늘 주문하면 내일 도착"], "혜택 재강조 → 구매 권유", ["빠른 배송"], "product_cutout", "제품 컬러별 정렬, 하단에 배송 안내 배너", "마지막 구매 결정을 유도", "컬러 / 옵션별 단독컷"],
  ] as const).map(([role, title, keyCopy, copyPattern, appealPoints, kind, composition, purpose, myImageGuide], index) => {
    // Mirrors the default slicing plan (1400px slices, 80px overlap): a slice starts every 1320px.
    const top = index * 600;
    return {
      order: index, role, title, keyCopy: [...keyCopy], copyPattern, appealPoints: [...appealPoints],
      visuals: [{ kind, composition, purpose }], myImageGuide,
      sourceSlice: { index: Math.floor(top / 1320), top, bottom: top + 600 },
    };
  }),
  checklist: checklistItems.map((item, index) => ({ item, present: index % 3 !== 1, note: "가상 상품 예시의 섹션 구성을 기준으로 확인했습니다." })),
  scores: scoreCriteria.map(criterion => ({ criterion, score: 7, max: 10, reason: "예시의 상품 소개와 사용 안내를 기준으로 한 참고 점수입니다." })),
  suggestions: ["첫 화면에 내 상품의 대표 혜택을 구체적으로 적어 주세요.", "스펙 아래에 내 상품의 실제 사용 사진을 배치하세요.", "마지막에 배송과 교환 조건을 안내하세요."], usage: { input: 0, output: 0, estimatedCostUsd: 0 },
};
