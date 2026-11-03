"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { listReports } from "../lib/client/report-store";
const subscribe = (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); };

export default function Home() {
  const stored = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem("dps:reports") ?? ""; } catch { return ""; } }, () => "");
  const reports = stored ? listReports() : [];
  return (
    <main className="workspace">
      <header>
        <p className="eyebrow">스마트스토어 상세페이지 작업 공간</p>
        <h1>Detail Page Studio</h1>
        <p>상세페이지의 구성과 전달 방식을 살펴보고, 내 상품의 이야기를 만들어 보세요.</p>
      </header>
      <nav className="actions" aria-label="작업 시작">
        <Link className="action" href="/analyze">경쟁 상세페이지 분석 <span aria-hidden="true">→</span></Link>
        <Link className="action" href="/create">내 상세페이지 만들기 <span aria-hidden="true">→</span></Link>
      </nav>
      <section className="empty" aria-labelledby="recent-heading">
        <h2 id="recent-heading">최근 작업</h2>
        {reports.length ? <ul className="recent-list">{reports.map(report => <li key={report.id}><Link href={`/analyze/${encodeURIComponent(report.id)}`}>{report.summary.slice(0, 80)}</Link><p><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString("ko-KR")}</time> · 총점 {report.scores.reduce((sum, score) => sum + score.score, 0)} / 60점</p></li>)}</ul> : <><p>아직 최근 작업이 없습니다.</p><Link href="/analyze/sample">예시 리포트 보기</Link></>}
      </section>
    </main>
  );
}
