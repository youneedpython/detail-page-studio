# TASK-006 — 분석 입력 / 리포트 화면

## 목적

사용자가 경쟁 상세페이지 캡처를 올려 분석을 요청하고, 결과 리포트를 읽기 쉽게 보는 화면을 만든다(docs/03-UX_UI_SPEC.md 1 · 2절, `/analyze`, `/analyze/[id]`).

## 선행 조건

- TASK-005 완료(`/api/analyze`, `AI_CLIENT=fake` 샘플 리포트). 새 Dependency 없음.

## 범위

1. 공통 클라이언트 모듈 (`src/lib/client/`)
   - `report-store.ts`: localStorage 키 `dps:reports`에 리포트 JSON 목록 저장(최신순, 최대 20개). `saveReport`, `getReport(id)`, `listReports()`, `removeReport(id)`. 모든 접근을 try/catch로 감싸 저장소를 쓸 수 없어도 화면이 깨지지 않게 한다. **이미지는 저장하지 않는다**(DEC-007).
   - `session-images.ts`: 분석 직후 원본 이미지 Object URL을 리포트 id별로 메모리에만 보관(모듈 변수). 새로고침하면 사라진다. 새 분석 시 이전 URL을 `revokeObjectURL`로 정리.
   - `labels.ts`: `SectionRole` / `visuals.kind` 한국어 이름(docs/13 1 · 2절 표의 "이름" 열), 오류 코드별 한국어 안내.
   - `sample-report.ts`: 예시 리포트(가상 상품 "데일리 텀블러 500ml", 섹션 5개 이상, 실제 리포트와 같은 `AnalysisReport` 형식, id `sample`).
2. `/analyze` 분석 입력 (client component)
   - 파일 선택(여러 장, `accept="image/png,image/jpeg,image/webp"`) + 드래그 앤 드롭 영역. 목록에 썸네일 / 파일명 / 크기, 위 / 아래 이동, 삭제. 10장 / 20MB 제한은 클라이언트에서 먼저 안내.
   - 선택 입력: 상품명, 가격, 카테고리.
   - 이용 안내(항상 표시): "본인이 열람한 상세페이지의 캡처만 올려 주세요. 업로드한 이미지는 분석에만 쓰이고 서버에 저장되지 않습니다. 분석 결과는 참고용입니다."
   - 캡처 방법 안내(접었다 펴기): docs/03 4절 내용.
   - 분석 요청: `FormData`로 `/api/analyze` POST. 진행 중에는 단계 문구(이미지 확인 → 섹션 분석 → 리포트 정리)와 경과 시간, 취소 버튼(AbortController). 실패 시 오류 코드별 안내 + 다시 시도(선택한 이미지 유지).
   - 성공 시 `saveReport` + `session-images` 등록 → `/analyze/[id]`로 이동.
3. `/analyze/[id]` 리포트 (client component, id가 `sample`이면 예시 리포트)
   - 리포트가 없으면 빈 상태(“리포트를 찾을 수 없습니다” + 새 분석 / 예시 보기 링크).
   - 상단: 요약, 추정 타깃, 톤, 총점(60점 만점) + "점수는 참고값이며 판매 성과를 보장하지 않습니다".
   - 왼쪽(Desktop 1024px 이상) / 위(그 미만): 원본 캡처. 메모리에 이미지가 있으면 각 섹션 시작 위치(`sourceSlice.top`, 원본 좌표 → 표시 크기 비율 환산)에 섹션 번호 표시. 없으면 "원본 이미지는 저장하지 않아 새로고침 후에는 볼 수 없습니다" 안내.
   - 오른쪽: 섹션 흐름 타임라인(역할 배지 순서) → 섹션 카드(제목, 역할, 핵심 문구, 전개 방식, 소구 포인트, 이미지 분석, 내 사진 가이드). 카드를 누르면 왼쪽 이미지의 해당 위치로 스크롤.
   - 체크리스트(있음 / 없음 + 근거), 점수 6항목(막대 + 근거), 개선 제안.
   - 하단 버튼: "이 구조로 내 상세페이지 만들기" → `/create?report=<id>`, "JSON 내려받기"(리포트 JSON 파일 저장).
4. 홈 `/` 최근 작업: `listReports()`로 최근 리포트(제목 = 요약 앞부분, 날짜, 총점) 목록. 없으면 기존 빈 상태 + "예시 리포트 보기" 링크(`/analyze/sample`, TASK-002 F-005).
5. 스타일: 기존 `globals.css` 방식(일반 CSS 클래스)을 따른다. 390 / 768 / 1280 폭에서 가로 스크롤이 없어야 한다.
6. Test (Testing Library, `fetch` / localStorage는 Test에서 대체)
   - report-store: 저장 / 최신순 / 20개 제한 / 저장소 예외 시 빈 목록
   - 분석 입력: 파일 없으면 버튼 비활성, 순서 변경 / 삭제, 성공 시 저장 후 이동, 오류 코드 안내와 이미지 유지, 취소
   - 리포트: 예시 리포트 렌더링(총점, 체크리스트 10, 점수 6, 역할 한국어 이름), 없는 id 빈 상태, 이미지 없음 안내
   - 홈: 최근 작업 목록 / 빈 상태 예시 링크
7. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- 리포트 서버 저장, 로그인, `/create` 화면(TASK-008)

## 완료 조건

- `bash scripts/verify.sh` 성공
- 화면 캡처(390 / 768 / 1280: 분석 입력, 예시 리포트)는 Claude 세션이 `docs/images/task-006/`에 추가한다.

## 작성 주의 (Harness Secret Guard)

- 이름에 token / key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 해당 단어를 객체 Key / 변수 / 매개변수 이름에 쓰지 않는다(예: localStorage 이름 상수는 storage 뒤에 key를 붙이지 말고 `REPORTS_SLOT`처럼 짓는다).
