import Link from "next/link";

export default function CreatePage() {
  return (
    <main className="workspace">
      <p className="eyebrow">내 상세페이지 만들기</p>
      <h1>준비 중</h1>
      <p>내 상품 정보와 사진으로 상세페이지를 만드는 공간을 준비하고 있습니다.</p>
      <Link className="back" href="/">홈으로 돌아가기</Link>
    </main>
  );
}
