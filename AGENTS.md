# SmartStore Detail Page — Multi-Agent 작업 규칙

## 1. 문서 목적

이 파일은 SmartStore Detail Page Repository에서 Codex Executor / Claude Reviewer / Orchestrator / Human이 따르는 최상위 작업 규칙을 정의한다.

이 프로젝트는 **명세 → 계획 → 사람 승인 → Task 단위 구현 → 검증 → 기록** 흐름을 지키는 Harness 기반으로 개발한다.

---

승인 근거는 `docs/09-DECISIONS.md` DEC-001이며 상세 권한 / 금지는 `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md`, 실행 설계는 `docs/12-ORCHESTRATOR-DESIGN.md`를 따른다.

| 역할 | 권한 | 금지 |
|---|---|---|
| Codex / Executor | Human이 실행 지시한 승인 Task의 허용 경로 Working Tree 수정 / Test / 문서화 / Rework | 임의 Task 시작 / 범위 확대 / Gate 결정 / 독자 Commit / Push / PR / Merge |
| Claude / Reviewer | 완전 Read-only로 Task Contract / 실제 Diff / Verification / 승인 Decision 검토, Verdict / Finding 작성 | Source / 문서 / Git 수정, 배포, 승인 대행, 임의 실행 도구 사용 |
| Orchestrator | 승인된 실행 순서 / Verification / 자동 Review / 반복 횟수 / Gate 정지 제어 | 권한 확대 / Gate 우회 / 무한 반복 / 승인 전 Git·배포 자동화 / Merge |
| Claude Code 세션 | DEC-008 위임 범위의 Gate 결정 기록 / Push / PR / Squash Merge / Orchestrator 실행 | Force Push / Ruleset Bypass / Auto Merge / 위임 예외 항목 결정 |
| Human | 방향 결정 / 위임 예외 항목(비용 Resource, 비용 상한 인상, 공개 범위, Secret) / 로그인 / 최종 Review | — |

명세 / 계획 / Gate 문서 작업(TASK-001 등 Orchestrator 실행 전 단계)은 Human 지시에 따라 Claude Code 세션이 수행할 수 있다. 이때도 Human 승인 없이 Decision을 확정하지 않는다.

---

## 2. 작업 시작 전 반드시 읽을 문서

1. `AGENTS.md`
2. `docs/01-PROJECT.md`
3. `docs/03-UX_UI_SPEC.md`
4. `docs/04-ARCHITECTURE.md`
5. `docs/05-API_SPEC.md`
6. `docs/09-DECISIONS.md`
7. `docs/06-PLAN.md`, `docs/07-TASKS.md`
8. `docs/tasks/COMMON.md`와 해당 Task Contract
9. `docs/11-MULTI-AGENT-ORCHESTRATION-POLICY.md`
10. `docs/12-ORCHESTRATOR-DESIGN.md`

---

## 3. 현재 단계 규칙

현재 단계는 **TASK Execution 단계**이다. DEC-002 ~ DEC-008이 승인되었다. Task 실행 지시와 Merge는 DEC-008에 따라 Claude Code 세션이 수행한다.

Current Task:

```text
TASK-004 — 이미지 업로드 검증 / 분석용 세로 분할
```

Status:

```text
DONE
```

Task 실행 시에는 다음 규칙을 따른다.

- `docs/07-TASKS.md`의 Current Task를 확인한다.
- READY 상태의 Current Task만 실행할 수 있다.
- 필요한 Human Approval / Gate가 완료되었는지 확인한다.
- 사용자의 명시적인 실행 지시가 있어야 Task를 시작한다.
- Task 시작 시 해당 Task만 IN_PROGRESS로 변경한다.
- BLOCKED Task는 실행하지 않는다.
- Task 범위를 벗어난 작업은 수행하지 않는다.
- 새로운 승인되지 않은 Dependency가 필요하면 Gate C를 적용한다.

---

## 3.1 문서 충돌 및 Source of Truth 규칙

- `AGENTS.md`: 작업 절차, 승인, 검증, 기록 규칙
- `docs/01-PROJECT.md`: 제품 목표, 범위, 완료 기준
- `docs/03-UX_UI_SPEC.md`: 화면, 상태, 상호작용 요구사항
- `docs/04-ARCHITECTURE.md`: 기술 책임과 목표 구조
- `docs/05-API_SPEC.md`: Frontend/Backend 간 API Contract
- `docs/09-DECISIONS.md`: Human Review를 통해 승인된 제품·기술·아키텍처 결정의 최종 기록

`docs/09-DECISIONS.md`에 승인된 결정이 있으면 해당 결정을 우선한다.
서로 모순되는 요구사항을 임의로 선택해서 구현하지 않는다. 충돌이 발견되면 작업을 중단하고 충돌 항목, 가능한 대안, 추천안을 보고한 뒤 Human Approval을 기다린다.

---

### 3.2 Multi-Agent 실행 흐름

- Preflight → Codex Execute → 변경 경로 / Schema Guard → Orchestrator Verify → Claude 자동 Review → Decide 순서로 실행한다. Human이 Agent 사이에서 결과를 옮기지 않는다.
- `CHANGES_REQUIRED` Finding은 같은 Task 범위의 Rework → Verify → Review로 자동 전달한다. `MAX_REVIEW_CYCLES=3`이며 첫 Review를 1회로 센다. 3번째도 `CHANGES_REQUIRED`이면 `HUMAN_REQUIRED`로 정지한다.
- Gate / 로그인 만료·미확인 시 `HUMAN_REQUIRED`로 정지하고 사유 / 대안 / 권장안 / Diff / Verification을 제공한다. 승인 입력 없이 정지 상태를 해제하지 않는다.
- 사용량 한도 / 실행 실패 / Timeout / Verification 실패 / Schema·변경 경로 오류는 `BLOCKED`로 정지한다. 자동 재시도 / 계정 전환 / API 우회를 금지한다.
- Deterministic Verification 실패를 AI `PASS`로 덮어쓰지 않는다. Reviewer 입력은 Task Contract + 실제 Diff(신규 파일 포함) + Verification Log + 승인 Decision이며 Codex 자기 설명은 전달하지 않는다.
- Agent는 로컬 로그인 CLI로만 실행한다. GitHub Actions는 Deterministic CI만 담당한다. Codex는 `workspace-write` / Task 허용 경로 / Windows `elevated` Sandbox를 적용한다. 무승인 CLI 설치 / 업데이트를 금지한다.

---

## 4. 구현 전 계획 규칙

명세 문서 검토와 Gate 결정이 끝나면 바로 코드를 작성하지 않고 `docs/06-PLAN.md`를 작성한다.

- Milestone
- 작업 순서
- 선행 의존성
- 검증 방법
- Human Approval Gate

계획 작성 후에는 구현을 멈추고 사람의 승인을 기다린다.

---

## 5. Human Approval이 필요한 변경

다음 변경은 Agent가 임의로 수행하지 않는다.

- 기술 스택 또는 주요 버전 변경 (Gate A)
- 분석 / 생성 규칙, 데이터 수집 범위 등 핵심 Business Rule 변경 (Gate B)
- 새로운 외부 라이브러리, 프레임워크, CI 동작 변경 (Gate C)
- API Contract 변경
- DB Schema의 주요 구조 변경
- 최상위 디렉터리 구조 변경
- 기존 기능 삭제 또는 요구사항 축소
- 인증/인가 방식 추가 또는 변경
- 외부 API 또는 외부 서비스 연동 추가 (네이버 API, LLM / Vision / 이미지 생성 API 포함)
- 외부 웹사이트 자동 수집(크롤링)의 대상 / 빈도 / 방식 변경
- 유료 API 사용량 또는 비용 상한 변경

필요한 경우 변경 이유와 대안을 먼저 제시하고 승인을 요청한다. 승인 범위는 Task / 변경 범위 / 검토 대상 Commit 또는 Diff에 연결하며 범위 밖 승인을 추론하지 않는다.

---

## 6. Task 단위 작업 규칙

- 한 번에 하나의 Task만 수행한다.
- Task 범위를 임의로 확장하지 않는다.
- 관련 없는 파일을 수정하지 않는다.
- Task 완료 조건을 충족하기 전에는 완료 처리하지 않는다.
- 실패한 Test 또는 Build를 숨기거나 강제로 성공 처리하지 않는다.

---

## 7. 검증 규칙

```text
코드 변경
  ↓
정적 검사 / Test
  ↓
Build
  ↓
통합 검증
  ↓
Task 완료
```

작업 완료 전 `scripts/verify.sh` 또는 `scripts/verify.ps1`을 실행한다. 현재는 Harness Orchestrator Test만 포함하며, 앱 검증 단계는 기술 스택 승인 후 추가한다.

검증 실패 시 Task를 완료 처리하지 않는다.

---

## 8. 기록 규칙

- `docs/07-TASKS.md`: 현재 작업 상태
- `docs/08-WORK_LOG.md`: 완료된 작업, 오류, 해결 과정의 누적 기록
- `docs/09-DECISIONS.md`: 중요한 기술적·제품적 결정 기록

Task를 완료할 때 관련 상태와 작업 기록을 함께 갱신한다.

### 8.1 화면 검토 캡처 기록

화면(UI)이 바뀌는 Task는 화면 검토 캡처를 Repository에 남긴다.

- 저장 위치: `docs/images/task-XXX/`
- 기본 캡처 폭: Mobile 390px, Tablet 768px, Desktop 1280px
- 수정이 있었다면 수정 전 / 수정 후 캡처를 함께 남긴다.
- `docs/08-WORK_LOG.md`의 해당 Task Verification에 Markdown 이미지로 연결한다.
- PNG는 가로 최대 1600px, 1장당 약 300KB 이하로 압축한다.
- 캡처에 Secret, Password, 개인 인증 정보, 타 판매자의 개인정보가 보이지 않는지 확인한다.

---

## 9. Prompt 기록 규칙

주요 작업 지시는 `prompts/` 디렉터리에 번호를 붙여 기록한다(Requirements Review, Decision 반영, Plan / Task 생성, 주요 Feature, Architecture / API Contract 변경, Verification / CI 구성, 중요한 오류 수정).

Prompt 기록에는 목적, 실행 단계, 사용 Context, 실제 Prompt, 기대 산출물, Human Approval 여부, 결과, Related Commit을 포함한다. Prompt 기록은 요구사항 Source of Truth를 대체하지 않는다.

```text
AGENTS.md → Agent 작업 규칙
docs/     → 프로젝트 요구사항, 계획, 상태, 결정
prompts/  → Human이 Agent에게 내린 주요 실행 지시
```

---

## 10. UI/UX 규칙

`docs/03-UX_UI_SPEC.md`를 기준으로 한다.

- 분석 결과와 제작 결과를 한눈에 비교할 수 있는 정보 구조
- Loading / Error / Empty 상태 고려 (외부 수집·생성 API는 느리거나 실패할 수 있음)
- Desktop / Tablet / Mobile 반응형 고려. 생성되는 상세페이지는 모바일 폭(860px 이하) 미리보기를 기본으로 한다.
- 접근성을 해치지 않는 대비와 상호작용 상태 제공
- Hard-coded UI Data를 최종 구현으로 남기지 않음

---

## 11. 보안 및 설정 규칙

다음 정보는 Repository에 직접 Commit하지 않는다.

- 실제 DB Password
- API Key (네이버 API, LLM / 이미지 API 포함)
- Access Token / Secret Key
- 개인 인증 정보, 판매자 계정 정보

앱의 민감 정보는 승인된 환경변수(`.env.local`, Git 비추적) 또는 GitHub Secrets를 사용한다.

- Agent(Codex / Claude CLI)는 OpenAI / Anthropic API Key를 사용하지 않는다. Human 로그인 후 구독 로그인을 공유하는 로컬 CLI로 진행한다. 앱이 런타임에 호출하는 LLM API Key는 이와 별개이며 외부 연동 Gate 승인 후 환경변수로만 전달한다.
- GitHub 로그인은 Human이 수행한다. 로그인 만료 / 미확인 시 재로그인 없이 `HUMAN_REQUIRED`로 정지한다.
- Run 기록은 Git 비추적 `.harness/runs/<run-id>/`에 저장하며 Prompt / 결과 / stdout / stderr / Verify Log는 저장 전 Redaction한다. 입력 / 명령 인자에 Secret 값을 넣지 않는다.
- 다른 판매자의 상세페이지는 분석 용도로만 사용하고, 제작 결과물에는 사용자 본인 이미지만 쓴다(DEC-007).
- 실제 상품 이미지, 경쟁 상세페이지 캡처, 생성 결과물 이미지는 Repository에 Commit하지 않는다. 로컬에서는 Git 비추적 `private/`에 둔다. Test Fixture와 `docs/images/` 캡처에는 가상 이미지 / 더미 상품만 쓴다.

---

## 12. Git / Commit 규칙

- Task 하나 = Task Branch 하나 = PR 하나. Branch 이름은 `task/TASK-0XX-<짧은-이름>`이다.
- `main` 직접 Push와 Force Push / History Rewrite를 금지한다. PR + Remote CI(`verify`) / Claude PASS / 필요한 Gate 충족 후 Squash Merge한다. main에는 Task당 Commit 1개를 남긴다.
- Task 완료 승인 = PR Squash Merge이다. DEC-008에 따라 Claude Code 세션이 Merge 조건 확인 후 수행한다. Codex / Orchestrator Script의 Merge와 Auto Merge는 금지한다.
- Orchestrator Git 자동화(Stage / Commit / Push / Draft PR)는 `harness/config.local.json`의 `git_automation: true`일 때만 동작한다. GitHub Remote / Branch Ruleset 구성과 Human 승인 전에는 `false`를 유지하고 Human 또는 Claude 세션이 Human 지시 후 Git 작업을 수행한다.
- 자동화가 켜지면 Deterministic Verification 성공 + Executor DONE + Claude PASS + 미해결 Human Gate 없음일 때만 Git 작업을 수행한다. Stage는 allowed_paths 안의 파일을 개별 추가하며 `git add .`와 forbidden_paths / Secret 파일 Stage를 금지한다.
- Draft PR 본문에는 Task ID, Verification, Review Verdict, Human Gate 여부, Codex / Claude Co-author Trailer를 포함한다.

```text
Task 구현
  ↓
Test / Build / Orchestrator Verify
  ↓
Claude 자동 Review / 필요한 Rework
  ↓
TASKS / WORK_LOG 갱신 / 필요한 Human Gate
  ↓
승인된 역할의 Commit / Push / PR
  ↓
Remote CI / Claude 세션 Squash Merge (DEC-008)
```

Commit 형식은 `docs:` / `feat:` / `test:` / `ci:` / `chore:` + 한국어 요약 + `- ` 목록을 사용한다. Codex 작업이 포함되면 다음 Trailer를 포함한다.

```text
Co-authored-by: Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>
```

---

## 13. 완료 보고 규칙

Agent는 작업을 마친 후 최소한 다음을 보고한다.

1. 수행한 Task
2. 생성/수정한 파일
3. 주요 구현 내용
4. 실행한 검증
5. 검증 결과
6. 남은 이슈 또는 다음 Task

요구사항에 없는 다음 단계 작업을 임의로 미리 수행하지 않는다.
