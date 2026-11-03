"use client";
import Link from "next/link";
import { DemoBanner } from "../../components/demo-banner";
import { errorLabels } from "../../lib/client/labels";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listReports } from "../../lib/client/report-store";
import { sampleReport } from "../../lib/client/sample-report";
import { saveDraft } from "../../lib/client/draft-store";
import { getPhotoStore, storePhotos } from "../../lib/client/photo-store";
import type { DetailDraft, GenerateRequest } from "../../lib/generation/schema";
type Upload = { file: File; url: string; description: string };
const generationErrors: Record<string, string> = {
  AI_NOT_CONFIGURED: errorLabels.AI_NOT_CONFIGURED,
  INVALID_REQUEST: "상품명, 특징과 사진 설명을 확인해 주세요.",
  BUDGET_EXCEEDED: "이번 달 AI 사용 한도에 도달했습니다.",
  AI_REFUSED: "이 상품 정보로 초안을 만들기 어렵습니다. 입력 내용을 확인해 주세요.",
  AI_TIMEOUT: "생성 시간이 초과되었습니다. 다시 시도해 주세요.",
  AI_UNAVAILABLE: "생성 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
  AI_INVALID_OUTPUT: "생성 결과를 정리하지 못했습니다. 다시 시도해 주세요.",
};
const subscribe = () => () => {};
export default function CreatePage({ isDemo = false }: { isDemo?: boolean }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return ready ? <CreateForm isDemo={isDemo} /> : <main className="workspace">상품 입력을 준비하고 있습니다.</main>;
}
function CreateForm({ isDemo }: { isDemo: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(""); const [features, setFeatures] = useState([""]);
  const [target, setTarget] = useState(""); const [priceRange, setPriceRange] = useState("");
  const [reports] = useState(() => [...listReports().filter(item => item.id !== "sample"), sampleReport]); const [reference, setReference] = useState(() => new URLSearchParams(window.location.search).get("report") ?? "");
  const [uploads, setUploads] = useState<Upload[]>([]); const owned = useRef<Upload[]>([]);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false); const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(""); const [volatile, setVolatile] = useState(false);
  useEffect(() => {
    void getPhotoStore().then(store => setVolatile(!store.persistent));
    return () => { owned.current.forEach(item => URL.revokeObjectURL(item.url)); controller.current?.abort(); };
  }, []);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setElapsed(value => value + 1), 1000); return () => clearInterval(timer); }, [busy]);
  function update(next: Upload[]) { owned.current = next; setUploads(next); }
  function move(index: number, delta: number) { const next = [...uploads]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; update(next); }
  function add(files: File[]) {
    if (uploads.length + files.length > 20) { setError("내 사진은 최대 20장까지 선택할 수 있습니다."); return; }
    if (files.some(file => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) { setError("JPG / PNG / WEBP 사진을 선택해 주세요."); return; }
    update([...uploads, ...files.map(file => ({ file, url: URL.createObjectURL(file), description: "" }))]); setError("");
  }
  const valid = !!name.trim() && features.every(feature => !!feature.trim());
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !valid) return;
    const selected = reports.find(item => item.id === reference);
    const body: GenerateRequest = { product: { name, features, target, priceRange }, myImages: uploads.map((item, index) => ({ index, description: item.description })), ...(selected ? { referenceReport: { sections: selected.sections, tone: selected.tone, target: selected.target } } : {}) };
    const request = new AbortController(); controller.current = request; setBusy(true); setElapsed(0); setError("");
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: request.signal });
      const data = await response.json(); if (request.signal.aborted) return;
      if (!response.ok) { setError(generationErrors[data.error?.code] ?? "초안을 생성하지 못했습니다. 다시 시도해 주세요."); return; }
      const draft = data as DetailDraft;
      const store = await storePhotos(draft.id, uploads.map((item, index) => ({ index, blob: item.file, description: item.description })));
      if (request.signal.aborted) return;
      const now = new Date().toISOString();
      if (!saveDraft({ ...draft, productName: name.trim(), createdAt: now, updatedAt: now, warnings: [...draft.warnings, ...(!store.persistent ? ["새로고침하면 사진이 사라집니다"] : [])] })) { setError("브라우저에 초안을 저장하지 못했습니다. 저장 공간과 설정을 확인해 주세요."); return; }
      router.push(`/create/${encodeURIComponent(draft.id)}`);
    } catch { if (!request.signal.aborted) setError("생성 서비스가 일시적으로 응답하지 않습니다. 다시 시도해 주세요."); }
    finally { if (controller.current === request) { controller.current = null; setBusy(false); } }
  }
  return <main className="workspace"><DemoBanner visible={isDemo} /><p className="eyebrow">내 상세페이지 만들기</p><h1>내 상품의 이야기를 시작하세요</h1>
    <p>사진은 이 브라우저에만 저장되고 서버로 전송되지 않습니다. AI에는 사진 설명만 전달됩니다.</p>
    {volatile && <p role="status" className="warning">새로고침하면 사진이 사라집니다</p>}
    <form onSubmit={submit}><fieldset disabled={busy}><legend>상품 정보</legend><div className="fields">
      <label>상품명 (필수)<input value={name} maxLength={60} required onChange={event => setName(event.target.value)} /></label>
      <div>특징 (1 ~ 10개){features.map((feature, index) => <div className="feature-row" key={index}><label>특징 {index + 1}<input required maxLength={200} value={feature} onChange={event => setFeatures(features.map((item, i) => i === index ? event.target.value : item))} /></label><button type="button" disabled={features.length === 1} aria-label={`특징 ${index + 1} 삭제`} onClick={() => setFeatures(features.filter((_, i) => i !== index))}>삭제</button></div>)}<button type="button" disabled={features.length === 10} onClick={() => setFeatures([...features, ""])}>특징 추가</button></div>
      <label>타깃<input maxLength={100} value={target} onChange={event => setTarget(event.target.value)} /></label><label>가격대<input maxLength={50} value={priceRange} onChange={event => setPriceRange(event.target.value)} /></label>
      <label>참고 리포트<select value={reference} onChange={event => setReference(event.target.value)}><option value="">선택 안 함</option>{reports.map(report => <option key={report.id} value={report.id}>{report.id === "sample" ? "예시 리포트 · " : ""}{report.summary.slice(0, 60)}</option>)}</select></label>
    </div></fieldset><fieldset disabled={busy}><legend>내 사진</legend><label>사진 선택<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label><ol className="upload-list">{uploads.map((item, index) => <li key={item.url}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={`내 사진 ${index + 1}`} /><span>{item.file.name}</span><label>사진 {index + 1} 설명<input placeholder="예: 흰 배경 정면컷" maxLength={200} value={item.description} onChange={event => update(uploads.map((photo, i) => i === index ? { ...photo, description: event.target.value } : photo))} /></label><div className="button-row"><button type="button" disabled={index === 0} aria-label={`사진 ${index + 1} 위로`} onClick={() => move(index, -1)}>위</button><button type="button" disabled={index === uploads.length - 1} aria-label={`사진 ${index + 1} 아래로`} onClick={() => move(index, 1)}>아래</button><button type="button" aria-label={`사진 ${index + 1} 삭제`} onClick={() => { URL.revokeObjectURL(item.url); update(uploads.filter((_, i) => i !== index)); }}>삭제</button></div></li>)}</ol></fieldset>
      {error && <p role="alert">{error}</p>}{busy ? <div role="status"><p>초안을 생성하고 있습니다 · {elapsed}초 경과</p><button type="button" onClick={() => { controller.current?.abort(); setError("생성을 취소했습니다. 입력한 정보로 다시 시도할 수 있습니다."); }}>취소</button></div> : <button type="submit" className="primary" disabled={!valid}>초안 생성</button>}
    </form><Link className="back" href="/">홈으로 돌아가기</Link></main>;
}
