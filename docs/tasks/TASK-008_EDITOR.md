# TASK-008 — 상품 정보 입력 / 상세페이지 템플릿 / 편집기

## 목적

내 상품 정보와 내 사진으로 초안을 생성하고(`/api/generate`), 템플릿으로 렌더링한 상세페이지를 섹션 단위로 편집하는 화면을 만든다(docs/03-UX_UI_SPEC.md `/create`, `/create/[id]`, docs/14-GENERATION-RULES.md 3절 템플릿).

## 선행 조건

- TASK-006(리포트 저장소 / 화면 패턴), TASK-007(`/api/generate`) 완료. 새 Dependency 없음.

## 범위

1. 브라우저 저장 (`src/lib/client/`)
   - `draft-store.ts`: localStorage `dps:drafts`에 초안 JSON(최신순, 최대 20개, 사진 제외) `saveDraft` / `getDraft` / `listDrafts` / `removeDraft`. report-store와 같은 예외 처리.
   - `photo-store.ts`: 내 사진을 **브라우저 IndexedDB에만** 저장(DB `dps`, store `photos`, 키 = `${draftId}:${index}`, 값 = Blob + 설명). `PhotoStore` 인터페이스 + IndexedDB 구현 + 메모리 구현(Test용). IndexedDB를 쓸 수 없으면 메모리 구현으로 대체하고 "새로고침하면 사진이 사라집니다" 안내. 서버로 사진을 보내지 않는다(DEC-007).
2. `/create` 상품 정보 입력 (client)
   - 상품명(필수), 특징(1 ~ 10개, 항목 추가 / 삭제), 타깃, 가격대.
   - 내 사진: 여러 장 선택, 썸네일 + 설명 입력(예: "흰 배경 정면컷"), 순서 변경 / 삭제. 안내: "사진은 이 브라우저에만 저장되고 서버로 전송되지 않습니다. AI에는 사진 설명만 전달됩니다."
   - 참고 리포트 선택: 저장된 리포트 목록 + 예시 리포트, `?report=<id>`이면 미리 선택. 선택 안 함 가능.
   - 생성 요청: `/api/generate`에 `product`, `myImages`(index + description), `referenceReport`(sections / tone / target) 전송. 진행 / 취소 / 오류 안내(TASK-006 패턴, 오류 코드 `INVALID_REQUEST` 포함).
   - 성공 시 초안 저장 + 사진을 photo-store에 `draftId`로 저장 → `/create/[id]` 이동.
3. 상세페이지 템플릿 (`src/components/templates/`)
   - 6종: `hero`, `image-text`, `feature-list`, `spec-table`, `notice`, `cta`. 공통 props: 섹션 데이터 + 사진 URL(없으면 null).
   - 폭 860px 기준 고정 레이아웃(상세페이지 본문 폭). 큰 글자(모바일 축소 표시에서도 읽히도록 본문 26px 이상, 제목 44px 이상), 섹션 간 여백, 일관된 색 테마 1종.
   - 사진이 없으면 점선 자리 표시 상자에 `imageGuide` 문구를 보여 준다(내보내기에서는 TASK-009에서 처리).
   - `spec-table`은 bullets의 "항목: 값"을 2열 표로, 콜론이 없으면 한 줄로 표시.
   - `[확인 필요: ...]` 문구는 노란 배경으로 강조.
   - `DetailPage` 컴포넌트: 섹션 배열을 순서대로 렌더링, 루트 요소에 `data-detail-page` 속성(TASK-009 내보내기 대상).
4. `/create/[id]` 편집기 (client)
   - 초안이 없으면 빈 상태.
   - 상단: 제목(상품명), `warnings` 목록(있으면 경고 배너), 자동 저장 상태.
   - 왼쪽: 섹션 목록(번호 / 역할 한국어 이름 / 제목), 위 / 아래 이동, 삭제, 섹션 추가(템플릿 선택).
   - 가운데: `DetailPage` 미리보기(860px를 컨테이너 폭에 맞춰 CSS transform으로 축소 표시).
   - 오른쪽: 선택한 섹션 편집 — 템플릿, 제목, 본문, bullets(줄 단위), 사진 선택(내 사진 썸네일 중 하나 / 없음), 사진 가이드(읽기 전용). 글자 수 안내(docs/14 4절 상한 초과 시 경고 색).
   - 변경 즉시 미리보기 반영, 500ms 디바운스로 draft-store에 자동 저장.
   - 1024px 미만에서는 탭(섹션 / 미리보기 / 편집) 전환.
   - "PNG 내보내기" 버튼은 자리만 두고 비활성 + "다음 업데이트에서 제공" 안내(TASK-009).
5. 홈 최근 작업에 초안 목록 추가(리포트 / 초안 구분 표시).
6. 리포트 화면 "이 구조로 내 상세페이지 만들기" 버튼이 `/create?report=<id>`로 연결되는지 유지.
7. Test (Testing Library, fetch / localStorage / PhotoStore 대체)
   - draft-store 저장 / 목록 / 예외, photo-store 메모리 구현
   - 입력: 필수값 없으면 버튼 비활성, 특징 추가 / 삭제, 참고 리포트 사전 선택, 성공 시 저장 후 이동, 요청 본문에 사진 파일이 없고 설명만 있는지
   - 템플릿 6종 렌더링, 사진 없음 자리 표시, spec-table 표 변환, 확인 필요 강조
   - 편집기: 섹션 이동 / 삭제 / 추가, 문구 수정이 미리보기에 반영, 자동 저장 호출, 경고 배너
8. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- PNG 내보내기(TASK-009), 서버 저장 / 로그인

## 완료 조건

- `bash scripts/verify.sh` 성공
- 화면 캡처(입력 / 편집기, 390 / 768 / 1280)는 Claude 세션이 `docs/images/task-008/`에 추가한다(가상 상품 / 생성한 단색 사진만 사용).

## 작성 주의 (Harness Secret Guard)

- 이름에 token / api key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 해당 단어를 객체 Key / 변수 / 매개변수 이름에 쓰지 않는다. IndexedDB 레코드 식별자 필드는 `id`로 짓는다(예: `{ id: \`${draftId}:${index}\` }`, `keyPath: "id"`).
