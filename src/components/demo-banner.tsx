export function DemoBanner({ visible }: { visible: boolean }) {
  return visible ? <p role="status" className="warning">체험 모드: 실제 AI 대신 예시 결과를 보여 줍니다</p> : null;
}
