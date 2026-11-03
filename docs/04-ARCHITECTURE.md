# 04. Architecture

상태: `Not started (DEC-002 ~ DEC-004 승인 후 작성)`

작성할 항목:

- 구성 요소: Web Frontend, API Backend, 수집기(공식 API / URL 1건 수집), 분석 파이프라인(OCR / Vision / LLM), 생성 파이프라인(카피 / 템플릿 / 이미지 렌더링), 저장소
- 외부 연동 경계와 실패 / 재시도 / 비용 상한 처리
- Secret 전달 방식
- 테스트 전략: 외부 API / 수집 대상은 Fake / Fixture로 대체
