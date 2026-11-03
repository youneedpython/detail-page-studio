# TASK-009 — 상세페이지 PNG 내보내기

## 목적

편집기에서 만든 상세페이지를 스마트스토어에 올릴 수 있는 PNG 이미지로 내보낸다(docs/01-PROJECT.md 4.2 출력, docs/04-ARCHITECTURE.md "PNG 내보내기, 브라우저에서 처리").

## 선행 조건

- TASK-008 완료
- Claude 세션이 `html-to-image` 1.11.13(MIT)을 설치 / Commit했다. Executor는 Dependency를 추가 / 변경하지 않는다.

## 범위

1. `src/lib/client/export-plan.ts` (순수 함수)
   - `planExport(sectionHeights: number[], maxHeight = 16000): number[][]` — 섹션 순서를 유지하며 높이 합이 `maxHeight` 이하가 되도록 묶음(섹션 순번 배열)으로 나눈다. 한 섹션이 `maxHeight`보다 크면 단독 묶음으로 둔다. 브라우저 Canvas 높이 제한을 피하기 위한 것이다.
   - `exportFileName(productName, part, total)` — 파일명에서 사용할 수 없는 문자(`\ / : * ? " < > |`)와 앞뒤 공백 제거, 비면 `detail-page`. `상품명.png` 또는 `상품명-1of3.png`, 섹션별은 `상품명-section-02.png`.
   - `countPlaceholders(sections)` — `[확인 필요: ...]` 문구 개수, 사진이 없는 섹션 수(`imageSlot === null`).
2. `src/lib/client/export-png.ts`
   - `html-to-image`의 `toBlob`(또는 `toPng`)으로 DOM 요소를 PNG로 만든다. 폭 860px, `pixelRatio` 1(스마트스토어 상세 본문 폭 기준), 배경 흰색.
   - 내보내기 대상은 편집기의 축소 미리보기가 아니라 **화면 밖에 축소 없이 렌더링한 `DetailPage`**(`position: fixed; left: -10000px` 등, `aria-hidden`)다.
   - 내보내기 동안 루트에 `data-exporting` 속성을 붙이고, CSS로 사진 없는 자리 표시 상자(`.detail-placeholder`)를 숨기고 `mark`(확인 필요) 배경을 그대로 둔다(사용자가 놓치지 않게).
   - 다운로드: Blob → Object URL → `<a download>` 클릭 → 다음 Tick에 URL 해제. 여러 파일은 순서대로 0.3초 간격으로 내려받는다.
3. 편집기 내보내기 UI (`src/components/draft-editor.tsx` 등)
   - 기존 비활성 버튼과 "다음 업데이트에서 제공" 문구를 대체한다.
   - "전체 이미지 내보내기": 섹션 높이를 측정해 `planExport` → 묶음이 1개면 한 장, 여러 개면 나눠서 내려받고 "길이가 길어 N장으로 나눠 저장했습니다" 안내.
   - "섹션별 내보내기": 섹션마다 한 장.
   - 내보내기 전 확인: `countPlaceholders` 결과가 0이 아니면 "확인 필요 문구 n개, 사진 없는 섹션 m개가 있습니다. 그대로 내보낼까요?" 확인 대화상자(`window.confirm`이 아닌 화면 내 대화상자, 취소 가능).
   - 진행 중 버튼 비활성 + "이미지를 만드는 중" 상태, 실패 시 "이미지를 만들지 못했습니다. 브라우저를 새로고침한 뒤 다시 시도해 주세요." 안내.
   - 안내 문구: "내보낸 이미지는 내 컴퓨터에 저장됩니다. 서버로 전송되지 않습니다."
4. Test (`html-to-image`는 vi.mock으로 대체)
   - planExport: 경계값(정확히 maxHeight), 큰 단일 섹션, 빈 배열, 순서 유지
   - exportFileName: 금지 문자 제거, 빈 이름, 분할 / 섹션 번호 2자리
   - countPlaceholders
   - 편집기: 확인 대화상자 표시 / 취소 시 미호출 / 확인 시 호출, 묶음 수만큼 다운로드 호출, 실패 안내, 진행 중 비활성
5. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- ZIP 묶음, JPG 형식, 서버 렌더링, 스마트스토어 자동 등록

## 완료 조건

- `bash scripts/verify.sh` 성공
- 실제 브라우저 내보내기 확인과 편집기 캡처는 Claude 세션이 수행한다.

## 작성 주의 (Harness Secret Guard)

- 이름에 token / api key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 해당 단어를 객체 Key / 변수 / 매개변수 이름에 쓰지 않는다.
