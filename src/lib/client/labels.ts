import type { AnalysisReport } from "../analysis/schema";
export const roleLabels: Record<AnalysisReport["sections"][number]["role"], string> = {
  hook: "후킹", problem: "문제 제기", solution: "해결", differentiator: "차별점", proof: "근거 · 신뢰", spec: "상세 스펙", usage: "사용법", review: "후기", shipping: "배송 · 교환", cta: "구매 유도", other: "기타",
};
export const visualLabels = { model: "모델 착용 / 사용컷", product_cutout: "누끼 / 단독 제품컷", lifestyle: "연출 / 사용 장면", detail_closeup: "디테일 확대", infographic: "아이콘 · 도식 · 수치 그래픽", comparison: "비교표 / 비포·애프터", certificate: "인증서 / 성적서", review_capture: "후기 캡처", other: "기타" };
export const errorLabels: Record<string, string> = {
  INVALID_IMAGE: "이미지를 확인해 주세요. JPG / PNG / WEBP 상세페이지 캡처만 지원합니다.", TOO_LARGE: "최대 10장, 파일당 20MB까지 업로드할 수 있습니다.", AI_REFUSED: "이 이미지는 분석하기 어렵습니다. 다른 캡처를 선택해 주세요.", BUDGET_EXCEEDED: "이번 달 AI 사용 한도에 도달했습니다.", AI_UNAVAILABLE: "분석 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.", AI_INVALID_OUTPUT: "분석 결과를 정리하지 못했습니다. 다시 시도해 주세요.", AI_TIMEOUT: "분석 시간이 초과되었습니다. 다시 시도해 주세요.", INTERNAL_ERROR: "분석 요청을 처리하지 못했습니다. 다시 시도해 주세요.",
};
