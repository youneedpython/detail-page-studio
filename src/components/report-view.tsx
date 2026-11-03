"use client";
import Link from "next/link";
import { useSyncExternalStore, useState } from "react";
import { getReport } from "../lib/client/report-store";
import { getSessionImages } from "../lib/client/session-images";
import { sampleReport } from "../lib/client/sample-report";
import { roleLabels, visualLabels } from "../lib/client/labels";
const subscribe = () => () => {};
export function ReportView({ id }: { id: string }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [sizes, setSizes] = useState<Record<number, { width: number; height: number }>>({});
  const report = ready ? (id === "sample" ? sampleReport : getReport(id)) : undefined;
  if (!ready) return <main className="workspace">리포트를 불러오는 중입니다.</main>;
  if (!report) return <main className="workspace"><h1>리포트를 찾을 수 없습니다</h1><Link href="/analyze">새 분석</Link> · <Link href="/analyze/sample">예시 보기</Link></main>;
  const images = getSessionImages(id);
  // Rebuild the default server slicing plan (slice.ts, DEC-002 appendix).
  // Slice indices are global; coordinates remain relative to the source image.
  const sliceSources: number[] = [];
  for (let image = 0; image < images.length; image++) {
    const size = sizes[image];
    if (!size || size.width <= 0 || size.height <= 0) break;
    const height = Math.max(1, Math.round(size.height * Math.min(860, size.width) / size.width));
    for (let top = 0; top < height; top += 1400 - 80) {
      sliceSources.push(image);
      if (top + 1400 >= height) break;
    }
  }
  function jump(index: number) { document.getElementById(`marker-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "analysis-report.json"; link.click(); URL.revokeObjectURL(url); }
  return <main className="workspace report-workspace"><Link href="/">홈</Link><p className="eyebrow">{id === "sample" ? "가상 상품 예시 리포트" : "상세페이지 분석 리포트"}</p><h1>분석 리포트</h1><p>{report.summary}</p><p>추정 타깃: {report.target} · 톤: {report.tone}</p><h2>총점 {report.scores.reduce((sum, score) => sum + score.score, 0)} / 60점</h2><p>점수는 참고값이며 판매 성과를 보장하지 않습니다</p>
    <div className="report-columns"><aside className="panel"><h2>원본 캡처</h2>{!images.length && <p>원본 이미지는 저장하지 않아 새로고침 후에는 볼 수 없습니다</p>}{images.map((url, index) => <div className="source-image" key={url}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`${index + 1}번 원본 캡처`} onLoad={event => { const { naturalWidth: width, naturalHeight: height } = event.currentTarget; setSizes(previous => ({ ...previous, [index]: { width, height } })); }} />
      {report.sections.map((section, position) => sliceSources[section.sourceSlice.index] === index && sizes[index] ? <span className="source-marker" id={`marker-${position}`} key={position} style={{ top: `${section.sourceSlice.top / sizes[index].height * 100}%` }}>섹션 {position + 1}</span> : null)}</div>)}</aside><section><h2>섹션 흐름</h2><ol className="timeline">{report.sections.map((section, index) => <li key={index}><button onClick={() => jump(index)}>{index + 1}. {roleLabels[section.role]}</button></li>)}</ol>
      {report.sections.map((section, index) => <article className="panel section-card" key={index} onClick={() => jump(index)}><button className="section-title"><span className="badge">{index + 1} · {roleLabels[section.role]}</span><span>{section.title}</span></button><h3>핵심 문구</h3><p>{section.keyCopy.join(" · ")}</p><h3>전개 방식</h3><p>{section.copyPattern}</p><h3>소구 포인트</h3><p>{section.appealPoints.join(" · ")}</p><h3>이미지 분석</h3>{section.visuals.map((visual, position) => <p key={position}>{visualLabels[visual.kind]} · {visual.composition} · {visual.purpose}</p>)}<h3>내 사진 가이드</h3><p>{section.myImageGuide}</p></article>)}
    </section></div><section className="panel"><h2>체크리스트</h2><ul>{report.checklist.map(item => <li key={item.item}><strong>{item.present ? "있음" : "없음"} · {item.item}</strong><p>{item.note}</p></li>)}</ul></section>
    <section className="panel"><h2>항목별 점수</h2>{report.scores.map(score => <div key={score.criterion}><label>{score.criterion} {score.score} / {score.max}<meter min={0} max={score.max} value={score.score} /></label><p>{score.reason}</p></div>)}</section><section className="panel"><h2>개선 제안</h2><ul>{report.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul></section><div className="button-row"><Link className="primary" href={`/create?report=${encodeURIComponent(id)}`}>이 구조로 내 상세페이지 만들기</Link><button onClick={download}>JSON 내려받기</button></div></main>;
}
