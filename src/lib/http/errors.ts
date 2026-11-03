import { AiError } from "../ai/types";
import { ImageError } from "../image";

const aiFailures = {
  AI_NOT_CONFIGURED: [503, "AI 연결 설정이 필요합니다. .env.local에 사용할 AI의 인증 값(OPENAI_API_KEY 또는 ANTHROPIC_API_KEY)을 넣거나 AI_CLIENT=fake로 체험 모드를 사용하세요."],
  BUDGET_EXCEEDED: [429, "이번 달 AI 사용 한도에 도달했습니다."],
  AI_UNAVAILABLE: [502, "AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."],
  AI_INVALID_OUTPUT: [502, "AI 결과를 읽을 수 없습니다. 다시 시도해 주세요."],
  AI_TIMEOUT: [504, "AI 처리 시간이 초과되었습니다. 다시 시도해 주세요."],
  AI_REFUSED: [422, "AI가 이 요청을 진행할 수 없습니다."],
} as const;

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ImageError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.code === "TOO_LARGE" ? 413 : 400 });
  if (error instanceof AiError) {
    const [status, message] = aiFailures[error.code];
    return Response.json({ error: { code: error.code, message } }, { status });
  }
  console.error("상세페이지 처리 실패", error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." } }, { status: 500 });
}
