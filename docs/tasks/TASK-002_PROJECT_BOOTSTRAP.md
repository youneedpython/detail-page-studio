# TASK-002 — Project Bootstrap (Next.js / TypeScript / Test / verify 앱 단계)

## 목적

DEC-002 기술 스택으로 빈 앱 골격을 만들고, `scripts/verify.*`에 앱 검증 단계를 추가해 이후 Task가 같은 기준으로 검증되게 한다.

## 선행 조건

- TASK-001 완료, DEC-002 Human Approved
- Claude Code 세션이 승인 패키지를 설치 시점 최신 안정판으로 고정한 `package.json` / `package-lock.json`을 Task Branch에 먼저 Commit한다(DEC-008, Codex Sandbox는 네트워크가 없음). Executor는 Dependency를 추가 / 변경하지 않는다.

## 범위

1. Repository 루트에 Next.js(App Router, `src/` 디렉터리, TypeScript strict) 앱 생성
   - 승인 패키지(초안): `next`, `react`, `react-dom`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `eslint-config-next`, `tailwindcss`, `@tailwindcss/postcss`, `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`
   - `@anthropic-ai/sdk`와 이미지 / 내보내기 라이브러리는 이 Task에서 추가하지 않는다(TASK-003 이후).
2. `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`(`tsc --noEmit`), `test`(`vitest run`)
3. 화면: `/` 홈 골격(서비스명, 두 진입 버튼, 빈 상태 문구). `/analyze`, `/create`는 "준비 중" 자리 표시 페이지
4. Test: 홈 렌더링 Test 1개 이상
5. `scripts/verify.sh`, `scripts/verify.ps1`에 Harness Test 다음으로 `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build` 추가
6. `.gitignore`에 `.next/`, `next-env.d.ts` 정책 반영
7. `docs/09-DECISIONS.md` DEC-002에 실제 설치 Version 기록, `docs/07-TASKS.md` / `docs/08-WORK_LOG.md` 갱신

## 범위 밖

- AI 호출, 업로드, 분석 / 생성 로직
- CI Workflow 변경 (`verify.sh`만 바꾸면 CI에 반영된다)
- 배포 설정

## 완료 조건

- `bash scripts/verify.sh` 성공 (Harness Test + lint + typecheck + test + build)
- `npm run dev`로 `/`, `/analyze`, `/create`가 열린다
- 홈 화면 390 / 768 / 1280 캡처를 `docs/images/task-002/`에 저장 (허용 경로 밖이므로 Human 또는 Claude 세션이 추가)
- 승인 목록 밖 Dependency 없음
