"use client";
import Link from "next/link";
import { DemoBanner } from "../../components/demo-banner";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorLabels } from "../../lib/client/labels";
import { saveReport } from "../../lib/client/report-store";
import { setSessionImages } from "../../lib/client/session-images";
type Upload = { file: File; url: string };
export default function AnalyzePage({ isDemo = false }: { isDemo?: boolean }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const owned = useRef<Upload[]>([]);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => () => { owned.current.forEach(item => URL.revokeObjectURL(item.url)); controller.current?.abort(); }, []);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setElapsed(value => value + 1), 1000); return () => clearInterval(timer); }, [busy]);
  function update(next: Upload[]) { owned.current = next; setUploads(next); }
  function add(files: File[]) {
    if (uploads.length + files.length > 10 || files.some(file => file.size > 20 * 1024 * 1024)) { setError(errorLabels.TOO_LARGE); return; }
    if (files.some(file => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) { setError(errorLabels.INVALID_IMAGE); return; }
    update([...uploads, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))]); setError("");
  }
  function move(index: number, delta: number) { const next = [...uploads]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; update(next); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !uploads.length) return;
    const form = new FormData(event.currentTarget); uploads.forEach(item => form.append("images", item.file));
    const request = new AbortController(); controller.current = request; setBusy(true); setElapsed(0); setError("");
    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form, signal: request.signal });
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) { setError(errorLabels[data.error?.code] ?? errorLabels.INTERNAL_ERROR); return; }
      saveReport(data); setSessionImages(data.id, uploads.map(item => item.file)); router.push(`/analyze/${encodeURIComponent(data.id)}`);
    } catch { if (!request.signal.aborted) setError(errorLabels.AI_UNAVAILABLE); }
    finally { if (controller.current === request) { controller.current = null; setBusy(false); } }
  }
  return <main className="workspace"><DemoBanner visible={isDemo} /><p className="eyebrow">경쟁 상세페이지 분석</p><h1>캡처에서 구조를 발견하세요</h1>
    <p>본인이 열람한 상세페이지의 캡처만 올려 주세요. 업로드한 이미지는 분석에만 쓰이고 서버에 저장되지 않습니다. 분석 결과는 참고용입니다.</p>
    <details><summary>캡처 방법 안내</summary><p>PC Chrome: 개발자 도구 → 명령 메뉴 → &quot;Capture full size screenshot&quot;</p><p>모바일: 스크롤 캡처 기능</p><p>본인이 열람한 페이지만 업로드하고, 분석 결과는 참고용으로만 사용하세요.</p></details>
    <form onSubmit={submit}><fieldset disabled={busy}><legend>분석할 캡처</legend>
      <div className="dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) add(Array.from(event.dataTransfer.files)); }}><label>이미지 선택<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label><p>여기로 파일을 끌어 놓으세요. 최대 10장 · 파일당 20MB · JPG / PNG / WEBP</p></div>
      <ol className="upload-list">{uploads.map((item, index) => <li key={item.url}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={`${index + 1}번 캡처 미리보기`} /><span>{item.file.name} ({(item.file.size / 1024 / 1024).toFixed(2)} MB)</span><div className="button-row"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${item.file.name} 위로`}>위</button><button type="button" disabled={index === uploads.length - 1} onClick={() => move(index, 1)} aria-label={`${item.file.name} 아래로`}>아래</button><button type="button" onClick={() => { URL.revokeObjectURL(item.url); update(uploads.filter((_, i) => i !== index)); }} aria-label={`${item.file.name} 삭제`}>삭제</button></div></li>)}</ol>
      <div className="fields"><label>상품명 (선택)<input name="productName" maxLength={100} /></label><label>가격 (선택)<input name="price" maxLength={100} /></label><label>카테고리 (선택)<input name="category" maxLength={100} /></label></div></fieldset>
      {error && <p role="alert">{error}</p>}{busy ? <div role="status"><p>{["이미지 확인", "섹션 분석", "리포트 정리"][Math.min(2, Math.floor(elapsed / 10))]} · {elapsed}초 경과 (예상 단계)</p><button type="button" onClick={() => { controller.current?.abort(); setError("분석을 취소했습니다. 선택한 이미지로 다시 시도할 수 있습니다."); }}>취소</button></div> : <button className="primary" disabled={!uploads.length} type="submit">{error ? "다시 시도" : "분석 요청"}</button>}
    </form><Link className="back" href="/">홈으로 돌아가기</Link></main>;
}
