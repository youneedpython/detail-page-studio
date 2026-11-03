import Link from "next/link";

export default function Home() {
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
        <p>아직 최근 작업이 없습니다.</p>
        <p>분석과 제작 기능은 준비 중입니다.</p>
      </section>
    </main>
  );
}
