# TASK-004 — 이미지 업로드 검증 / 분석용 세로 분할

## 목적

사용자가 올린 상세페이지 캡처(긴 세로 이미지, 여러 장)를 검증하고, Vision 분석에 적합한 크기의 조각으로 나눈다(docs/04-ARCHITECTURE.md `lib/image`, docs/05-API_SPEC.md `/api/analyze` 요청 조건).

## 선행 조건

- TASK-003 완료
- Claude 세션이 `sharp` 0.35.5를 직접 Dependency로 설치 / Commit했다. Executor는 Dependency를 추가 / 변경하지 않는다.

## 범위

1. `src/lib/image/types.ts`
   - `UploadedImage`: `{ name: string; mimeType: string; size: number; data: Buffer }` (업로드 순서 = 페이지 위→아래)
   - `AnalysisSlice`: `{ index: number; sourceImage: number; top: number; bottom: number; width: number; height: number; mediaType: 'image/jpeg'; base64: string }`
     - `index`: 전체 조각 순번(0부터), `sourceImage`: 업로드 이미지 순번
     - `top` / `bottom`: **원본 업로드 이미지 기준** 픽셀 좌표(리포트 화면에서 원본 위치 표시용)
     - `width` / `height`: 인코딩된 조각 크기
   - `ImageError` (`code`: `INVALID_IMAGE` | `TOO_LARGE`, 사용자에게 보여 줄 한국어 `message`)
2. `src/lib/image/validate.ts` — `validateUploads(images: UploadedImage[]): Promise<void>`
   - 1 ~ 10장. 0장 / 11장 이상 → `INVALID_IMAGE` / `TOO_LARGE`
   - MIME `image/png` | `image/jpeg` | `image/webp`만 허용. 파일당 20MB 초과 → `TOO_LARGE`
   - sharp `metadata()`로 실제 디코딩 가능 여부와 형식을 확인한다(MIME 위조 차단). 디코딩 실패 → `INVALID_IMAGE`
   - 너비 300px 미만 → `INVALID_IMAGE`(상세페이지 캡처가 아닐 가능성 안내)
3. `src/lib/image/slice.ts` — `sliceForAnalysis(images: UploadedImage[], options?: SliceOptions): Promise<AnalysisSlice[]>`
   - 기본값: 목표 너비 860px(더 크면 축소, 작으면 확대하지 않음), 조각 높이 1400px, 겹침 80px(조각 경계에 걸친 문구 보존), JPEG 품질 85
   - 각 업로드 이미지를 따로 처리한다(이미지끼리 이어 붙이지 않음). 마지막 조각은 남은 높이만큼만 자른다.
   - 전체 조각 수가 `maxSlices`(기본은 환경변수 `AI_MAX_SLICES_PER_ANALYSIS`, 비었거나 없으면 24)를 넘으면 `TOO_LARGE`. 메시지에 현재 조각 수와 상한을 넣는다.
   - EXIF 회전을 반영한다(`rotate()`), 알파 채널은 흰 배경으로 평탄화한다(JPEG).
4. `src/lib/image/index.ts` — 공개 API 재수출
5. Test (Vitest, Node 환경 — 파일 상단 `// @vitest-environment node`)
   - Test 이미지는 sharp로 코드에서 생성한다(단색 / 가로 줄무늬). Repository에 이미지 파일을 추가하지 않는다(DEC-007).
   - 검증: 허용 / 비허용 MIME, 크기 초과, 장수 경계, MIME 위조(텍스트 Buffer), 너무 좁은 이미지
   - 분할: 860 초과 너비 축소, 작은 이미지 비확대, 조각 수와 겹침, 원본 좌표(top / bottom) 환산, 마지막 조각 높이, 여러 장 순번, 상한 초과, PNG 알파 처리
6. `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- API Route, 업로드 화면, AI 호출

## 완료 조건

- `bash scripts/verify.sh` 성공
- 이미지 파일이 Commit에 포함되지 않음

## 작성 주의 (Harness Secret Guard)

- 이름에 token / key / secret / password가 들어가고 바로 뒤에 콜론이나 등호가 오는 줄은 Secret 할당으로 차단된다. 해당 단어를 객체 Key / 변수 / 매개변수 이름에 쓰지 않는다.
