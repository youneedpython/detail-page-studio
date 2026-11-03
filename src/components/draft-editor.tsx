"use client";
import Link from "next/link";
import { countPlaceholders } from "../lib/client/export-plan";
import { exportPng } from "../lib/client/export-png";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getDraft, saveDraft, type SavedDraft } from "../lib/client/draft-store";
import { getPhotoStore } from "../lib/client/photo-store";
import { roleLabels } from "../lib/client/labels";
import { templates } from "../lib/generation/schema";
import { DetailPage, type DetailSection } from "./templates/detail-page";
export const templateLabels = { hero: "첫 화면", "image-text": "사진과 본문", "feature-list": "특징 목록", "spec-table": "스펙 표", notice: "안내", cta: "구매 유도" };
function Preview({ draft, urls }: { draft: SavedDraft; urls: Record<number, string> }) {
  const container = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const measure = () => { if (container.current && content.current) setSize({ scale: Math.min(1, container.current.clientWidth / 860), height: content.current.offsetHeight }); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); if (container.current) observer.observe(container.current); if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="preview-container" style={{ height: size.height * size.scale }}><div ref={content} style={{ width: 860, transform: `scale(${size.scale})`, transformOrigin: "top left" }}><DetailPage sections={draft.sections} photoUrls={urls} /></div></div>;
}
const subscribe = () => () => {};
export function DraftEditor({ id }: { id: string }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return ready ? <Editor key={id} id={id} /> : <main className="workspace" role="status">초안을 불러오고 있습니다.</main>;
}
function Editor({ id }: { id: string }) {
  const [draft, setDraft] = useState<SavedDraft | null>(() => getDraft(id) ?? null);
  const [selected, setSelected] = useState(() => draft?.sections[0]?.id ?? ""); const [tab, setTab] = useState("preview");
  const [urls, setUrls] = useState<Record<number, string>>({}); const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [photoNotice, setPhotoNotice] = useState(""); const [status, setStatus] = useState("저장됨");
  const [adding, setAdding] = useState<DetailSection["template"]>("image-text");
  const exportRoot = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const exportBusy = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [pendingMode, setPendingMode] = useState<"all" | "sections">("all");
  async function runExport(mode: "all" | "sections") {
    if (!draft || !exportRoot.current || exportBusy.current) return;
    exportBusy.current = true; setExporting(true); setExportMessage("");
    try {
      const total = await exportPng(exportRoot.current, draft.productName, mode);
      setExportMessage(mode === "all" && total > 1 ? `길이가 길어 ${total}장으로 나눠 저장했습니다` : `${total}장 저장했습니다`);
    } catch { setExportMessage("이미지를 만들지 못했습니다. 브라우저를 새로고침한 뒤 다시 시도해 주세요."); }
    finally { exportBusy.current = false; setExporting(false); }
  }
  function requestExport(mode: "all" | "sections") {
    if (!draft) return;
    const counts = countPlaceholders(draft.sections);
    if (counts.text || counts.images) { setPendingMode(mode); confirmation.current?.showModal(); }
    else void runExport(mode);
  }
  const dirty = useRef(false); const latest = useRef<SavedDraft | null>(draft);
  useEffect(() => {
    let active = true; const created: string[] = [];
    void getPhotoStore().then(async store => {
      if (active && !store.persistent) setPhotoNotice("새로고침하면 사진이 사라집니다");
      const photos = await store.list(id); if (!active) return;
      const next: Record<number, string> = {}; const labels: Record<number, string> = {};
      photos.forEach(photo => { const url = URL.createObjectURL(photo.blob); created.push(url); next[photo.index] = url; labels[photo.index] = photo.description; }); setUrls(next); setDescriptions(labels);
    }).catch(() => { if (active) setPhotoNotice("사진을 불러오지 못했습니다. 사진 가이드를 확인해 주세요."); });
    return () => { active = false; created.forEach(url => URL.revokeObjectURL(url)); if (dirty.current && latest.current) saveDraft(latest.current); };
  }, [id]);
  useEffect(() => {
    if (!draft || !dirty.current) return;
    const timer = setTimeout(() => { const ok = saveDraft(draft); dirty.current = !ok; setStatus(ok ? "저장됨" : "저장 실패 · 브라우저 저장 공간을 확인해 주세요"); }, 500);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    const flush = () => { if (dirty.current && latest.current) saveDraft(latest.current); };
    window.addEventListener("pagehide", flush); return () => window.removeEventListener("pagehide", flush);
  }, []);
  function change(sections: DetailSection[]) { if (!draft) return; const next = { ...draft, sections, updatedAt: new Date().toISOString() }; dirty.current = true; latest.current = next; setDraft(next); setStatus("저장 중…"); }
  function edit(patch: Partial<DetailSection>) { if (draft) change(draft.sections.map(section => section.id === selected ? { ...section, ...patch } : section)); }
  function move(index: number, delta: number) { if (!draft) return; const next = [...draft.sections]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; change(next); }
  if (draft === undefined) return <main className="workspace" role="status">초안을 불러오고 있습니다.</main>;
  if (!draft) return <main className="workspace"><h1>초안이 없습니다</h1><p>이 브라우저에 저장된 초안을 찾지 못했습니다.</p><Link href="/create">새 초안 만들기</Link></main>;
  const section = draft.sections.find(item => item.id === selected);
  const count = (text: string, limit: number) => <span className={text.length > limit ? "length-warning" : "length-hint"}>{text.length} / {limit}자{text.length > limit ? " · 권장 길이 초과" : ""}</span>;
  return <main className="workspace editor-workspace"><header><p className="eyebrow">상세페이지 편집기</p><h1>{draft.productName}</h1><p role="status">자동 저장: {status}</p><div className="button-row"><button disabled={exporting || !draft.sections.length} onClick={() => requestExport("all")}>전체 이미지 내보내기</button><button disabled={exporting || !draft.sections.length} onClick={() => requestExport("sections")}>섹션별 내보내기</button></div><p>내보낸 이미지는 내 컴퓨터에 저장됩니다. 서버로 전송되지 않습니다.</p><p role="status">{exporting ? "이미지를 만드는 중" : exportMessage}</p></header>
    <dialog ref={confirmation} aria-labelledby="export-confirm-title"><h2 id="export-confirm-title">내보내기 전 확인</h2><p>확인 필요 문구 {countPlaceholders(draft.sections).text}개, 사진 없는 섹션 {countPlaceholders(draft.sections).images}개가 있습니다. 그대로 내보낼까요?</p><div className="button-row"><button onClick={() => confirmation.current?.close()}>취소</button><button onClick={() => { confirmation.current?.close(); void runExport(pendingMode); }}>그대로 내보내기</button></div></dialog>
    <div ref={exportRoot} aria-hidden="true" className="export-root"><DetailPage sections={draft.sections} photoUrls={urls} /></div>
    {!!draft.warnings.length && <aside className="warning" aria-label="초안 경고"><h2>게시 전 확인해 주세요</h2><ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}{photoNotice && <p className="warning" role="status">{photoNotice}</p>}
    <nav className="editor-tabs" aria-label="편집기 보기">{[["sections", "섹션"], ["preview", "미리보기"], ["edit", "편집"]].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
    <div className="editor-columns"><section className={`panel editor-panel ${tab === "sections" ? "mobile-active" : ""}`}><h2>섹션</h2><ol className="section-list">{draft.sections.map((item, index) => <li key={item.id}><button className="section-select" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setTab("edit"); }}>{index + 1}. {roleLabels[item.role]} · {item.headline || "제목 없음"}</button><div className="button-row"><button disabled={index === 0} aria-label={`섹션 ${index + 1} 위로`} onClick={() => move(index, -1)}>위</button><button disabled={index === draft.sections.length - 1} aria-label={`섹션 ${index + 1} 아래로`} onClick={() => move(index, 1)}>아래</button><button aria-label={`섹션 ${index + 1} 삭제`} onClick={() => { change(draft.sections.filter(candidate => candidate.id !== item.id)); if (selected === item.id) setSelected(draft.sections.find(candidate => candidate.id !== item.id)?.id ?? ""); }}>삭제</button></div></li>)}</ol><label>추가할 템플릿<select value={adding} onChange={event => setAdding(event.target.value as typeof adding)}>{templates.map(value => <option key={value} value={value}>{templateLabels[value]}</option>)}</select></label><button onClick={() => { const newId = crypto.randomUUID(); change([...draft.sections, { id: newId, role: "other", template: adding, headline: "새 섹션", body: "", bullets: [], imageSlot: null, imageGuide: "내 상품 사진을 준비해 주세요." }]); setSelected(newId); setTab("edit"); }}>섹션 추가</button></section>
    <section className={`panel editor-panel preview-panel ${tab === "preview" ? "mobile-active" : ""}`}><h2>미리보기</h2>{!draft.sections.length && <p>섹션을 추가해 주세요.</p>}<Preview draft={draft} urls={urls} /></section>
    <section className={`panel editor-panel ${tab === "edit" ? "mobile-active" : ""}`}><h2>섹션 편집</h2>{section ? <div className="fields"><label>템플릿<select value={section.template} onChange={event => edit({ template: event.target.value as DetailSection["template"] })}>{templates.map(value => <option key={value} value={value}>{templateLabels[value]}</option>)}</select></label><label>제목<input value={section.headline} onChange={event => edit({ headline: event.target.value })} />{count(section.headline, 25)}</label><label>본문<textarea rows={5} value={section.body} onChange={event => edit({ body: event.target.value })} />{count(section.body, 120)}</label><label>항목 (줄 단위)<textarea rows={6} value={section.bullets.join("\n")} onChange={event => edit({ bullets: event.target.value.split("\n") })} /></label>{section.bullets.map((bullet, index) => <div key={index}>항목 {index + 1}: {count(bullet, 40)}</div>)}<fieldset><legend>내 사진 선택</legend><button aria-pressed={section.imageSlot === null} onClick={() => edit({ imageSlot: null })}>없음</button><div className="photo-choices">{Object.entries(urls).map(([index, url]) => <button key={index} aria-label={`내 사진 ${Number(index) + 1} 선택`} aria-pressed={section.imageSlot === Number(index)} onClick={() => edit({ imageSlot: Number(index) })}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={descriptions[Number(index)] || `내 사진 ${Number(index) + 1}`} />{descriptions[Number(index)] || `사진 ${Number(index) + 1}`}</button>)}</div></fieldset><label>사진 가이드 (읽기 전용)<textarea readOnly value={section.imageGuide} /></label></div> : <p>편집할 섹션을 선택하거나 추가해 주세요.</p>}</section></div><Link className="back" href="/">홈으로 돌아가기</Link></main>;
}
