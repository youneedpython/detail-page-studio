# 08. Work Log

완료된 작업, 오류, 해결 과정의 누적 기록이다. 최신 항목을 아래에 추가한다.

---

## 2026-11-03 — Harness 뼈대 구성 (DEC-001)

- MoodFit v3(today-v3)에서 Orchestrator / Harness 자산을 복사하고 MoodFit 의존성을 제거했다.
  - 제거: AWS Profile Preflight(`aws-preflight.mjs`, Test, Fixture), Contract `aws_profiles`, 배포 / IaC / Staging · Production Script와 Workflow, MoodFit Task · 문서 · 이미지
  - 변경: Git 자동화 활성 조건을 Task 번호(≥ 22)에서 `harness/config.local.json`의 `git_automation`으로 변경, PR Gate Required Check를 `frontend` / `backend`에서 `verify`로 변경, 임시 경로 / Lock 이름의 `moodfit-` 접두사를 `harness-`로 변경
  - 재작성: AGENTS.md, docs/01 · 03 ~ 09 · 11 · 12, docs/tasks/COMMON.md, scripts/verify.*, .github/workflows/ci.yml
- Verification: `node --test scripts/orchestrator/*.test.mjs` 통과

---

## 2026-11-03 — TASK-001 Requirements / Gate A 초안 (Claude Code 세션)

- Repository 생성(Human) 후 첫 Commit을 `main`에 Push했다. `.gitattributes`로 줄바꿈 정책을 고정했다.
- DEC-006(분석 순서: 남의 스토어 → 내 스토어) 기록.
- DEC-003 조사: `smartstore.naver.com/robots.txt`가 모든 일반 봇을 `Disallow: /`로 막고, `shopping.naver.com/robots.txt`가 AI / RAG 목적 접근을 명시적으로 금지함을 확인했다. 서버 URL 수집 권장안을 철회하고 "1단계 캡처 업로드 + 2단계 커머스 API"로 갱신했다.
- DEC-002(Next.js + TypeScript), DEC-004(Claude Opus 5.5 + Fake Client), DEC-005(Ruleset) 권장안 작성. 모두 Human 승인 대기.
- docs/01 · 03 · 04 · 05 · 06 초안, TASK-002 Task 문서와 JSON Contract 작성. Contract는 Schema / 경로 검증을 통과했다.

---

## 2026-11-03 — TASK-001 완료

- Human이 DEC-002 ~ DEC-005와 docs/01 · 03 ~ 06을 승인했다. Merge 권한을 Claude Code 세션에 위임했다(DEC-008).
- 월 AI 비용 상한은 금액 지정이 없어 기본값 USD 30으로 기록했다.
- Codex Sandbox(workspace-write)에서 npm Registry 접근이 되지 않음을 확인했다. TASK-002 Dependency 설치는 Claude 세션이 Task Branch에 먼저 Commit한다.

---

## 2026-11-03 — TASK-002 Executor 구현

- App Router의 홈, 분석 / 제작 준비 중 페이지와 한국어 레이아웃을 구성했다. 홈에는 두 진입 링크와 최근 작업 빈 상태를 표시한다.
- TypeScript strict, Tailwind PostCSS, ESLint, Vitest / Testing Library 설정과 홈 렌더링 Test를 추가했다.
- npm 실행 Script 및 두 verify Script에 Harness 다음 npm ci / lint / typecheck / test / build 단계를 추가했다.
- 승인된 직접 의존성 17개의 Version이 Lockfile과 일치함을 확인했다. Dependency / Lockfile 변경 없음.
- Verification: `bash scripts/verify.sh` 실행에서 Harness Test 101개 통과 출력 확인. Executor가 실행 중 중단 입력을 보내 전체 Script는 exit 1로 종료했으며 전체 검증 성공으로 처리하지 않는다.
- 추가 설치 확인: `npm ci --offline --ignore-scripts --fetch-retries=0`은 npm 캐시에 eslint Registry 응답이 없어 ENOTCACHED로 종료했다. Sandbox의 네트워크 제한과 미설치 의존성으로 앱 lint / typecheck / test / build 및 dev 경로 확인은 실행하지 못했다. 승인된 ESLint 10에 대한 하위 eslint-plugin-import의 peer 범위 경고도 출력되었으며 실제 호환성은 Orchestrator 검증에서 확인해야 한다.
- (Executor 기록은 Sandbox 안의 중간 상태다. 최종 결과는 아래 Orchestrator / Claude 세션 기록을 따른다.)

## 2026-11-03 — TASK-002 Verification / 완료 (Orchestrator + Claude 세션)

- Orchestrator Run `2026-11-03T04-49-37-630Z-a81c8ebe`: Sandbox 밖 `bash scripts/verify.sh` 성공 — Harness 101/101, npm ci, lint(0 error), typecheck, vitest 1/1, next build(`/`, `/analyze`, `/create` 정적 생성). Claude Reviewer 1회차 PASS(비차단 Finding 6건). Draft PR #2 자동 생성.
- Claude 세션 후속 처리(Finding 반영):
  - F-002: `postcss.config.mjs` 익명 default export 경고 해소.
  - 추가 발견: ESLint / TypeScript가 `.harness/workspaces/`의 Worktree 사본까지 검사해 같은 경고가 중복되었다. `eslint.config.mjs` ignore와 `tsconfig.json` exclude에 `.harness`를 추가했다.
  - F-003(vitest 설정 ESM 경고), F-004(eslint-config-next 하위 Plugin의 ESLint 10 peer 경고), F-005(예시 리포트 링크)는 후속 Task에서 처리한다.
  - `scripts/capture-screens.mjs` 추가: Chrome DevTools Protocol로 정확한 폭(390 / 768 / 1280)의 화면을 캡처한다(외부 Dependency 없음). headless Chrome의 `--window-size`는 500px 미만 폭에서 화면이 잘리는 문제가 있어 직접 작성했다.
- `npm run start` 후 `/`, `/analyze`, `/create` 모두 HTTP 200 확인.

![TASK-002 Home 390](images/task-002/home-390.png)
![TASK-002 Home 768](images/task-002/home-768.png)
![TASK-002 Home 1280](images/task-002/home-1280.png)

---

## 2026-11-03 — TASK-003 Executor 구현

- AiClient 계약, 오류 코드, 요청 기록 / 응답 큐 / 비동기 응답 함수 / Schema 검증을 갖춘 Fake를 추가했다.
- Anthropic 구현은 승인된 모델과 Structured Output을 사용하며 이미지 블록, 기본 medium effort, SDK 타입 기반 오류 매핑을 처리한다. SDK 기본 환경변수를 사용하며 자동 재시도는 비활성화했다. 실제 API는 호출하지 않았다.
- 승인된 입력 / 출력 단가 계산, UTC 월별 비용 Guard, 메모리 및 JSON 파일 저장소를 추가했다. 파일 갱신은 같은 프로세스 안에서 직렬화하고 임시 파일 후 rename으로 기록한다. 손상된 사용액 파일은 초기화하지 않고 오류를 전파한다.
- createAiClient는 환경설정에 따라 Fake 또는 Anthropic을 선택하고 호출 전 한도 확인 / 성공 후 사용액 기록을 적용한다. Fake는 파일을 쓰지 않는다.
- 참고 검증: npm run lint, npm run typecheck 통과. npm test는 3개 파일 / 19개 Test 통과(기존 화면 Test 포함). SDK 요청 형태, 오류 매핑, Fake 계약, 비용 차단, UTC 월 경계, 임시 디렉터리 파일 영속성과 동시 갱신을 검증했다.
- bash scripts/verify.sh 실행: Harness 101개 Test 통과 후 npm ci 단계에서 장시간 대기하고 기존 ESLint peer 의존성 경고를 출력했다. 중단 입력으로 종료되지 않았고 프로세스 종료 요청도 Sandbox의 Access denied로 거부되었다. 전체 Script 성공으로 처리하지 않는다. 이 Worktree에는 로컬 node_modules가 없어 앱 개별 검증은 상위 Repository의 설치본을 사용했다.
- npm run build는 Turbopack이 Worktree 루트 안에서 next/package.json을 찾지 못해 실패했다. 설치 경계에 따른 환경 제한이며 앱 Build 성공 증거는 아니다. Sandbox 밖 Orchestrator Verify 결과가 최종 검증 기준이다.
- 최종 검증 기록(F-003 제공 Orchestrator Verify 결과): Sandbox 밖 `bash scripts/verify.sh`가 exit 0으로 종료했다. Harness 101개 Test, lint, typecheck, Vitest 19개 Test, next build가 모두 통과했다. 위 Executor Sandbox의 대기 / Build 실패 기록은 중간 참고 기록이며, 최종 검증 결과는 이 Orchestrator 성공 기록으로 대체한다.
- git diff --check, 추가 코드 Secret Guard, SDK import 경계 및 변경 문서 인코딩 검사를 통과했다. Task 상태는 IN_PROGRESS로 유지하며 검증 / Review / Merge 완료를 선언하지 않는다.
- 잔여 제한: 월 한도는 이미 누적된 사용액을 기준으로 다음 호출을 차단한다. 진행 중 호출의 비용 예약과 여러 프로세스 간 파일 잠금은 제공하지 않는다.

## 2026-11-03 — TASK-003 완료 (Orchestrator + Claude 세션)

- 1차 Run은 Preflight에서 BLOCKED: Task 문서의 토큰 수 필드 표기가 Secret Guard의 할당 규칙에 오탐되었다. 필드명을 input / output으로 바꾸고 Executor 작성 주의를 추가한 뒤 재실행했다.
- 2차 Run `2026-11-03T05-05-17-264Z-569b6a73`: Review 2회차 PASS, Orchestrator Verify 성공, Draft PR #3 자동 생성.
- Claude 세션 후속 처리: R-001 반영 — `AI_MONTHLY_BUDGET_USD`가 빈 문자열이면 기본값 30을 쓰도록 수정하고 Test를 추가했다. R-002(계약 밖 SDK 오류는 원형 전달)는 TASK-005 / 007 API Route에서 일반 오류로 감싸 처리한다.
