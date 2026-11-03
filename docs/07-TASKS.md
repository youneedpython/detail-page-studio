# 07. SmartStore Detail Page Tasks

## 1. 문서 목적

이 문서는 승인된 Implementation Plan을 실제 실행 가능한 Task 단위로 관리한다.

한 번에 하나의 Task만 실행한다. 현재 Task가 완료되고 Verification과 Human Review가 끝나기 전에는 다음 Task를 시작하지 않는다.

---

## 2. Task 상태 정의

READY
→ 선행 조건이 충족되어 실행 가능한 상태

BLOCKED
→ 선행 Task 또는 Human Approval이 필요한 상태

IN_PROGRESS
→ 현재 수행 중인 Task

REVIEW
→ 구현과 검증이 끝나 Human Review를 기다리는 상태

DONE
→ Verification과 Human Review가 완료된 상태

---

## 3. Current Task

TASK-004 — 이미지 업로드 검증 / 분석용 세로 분할

Status:

```text
READY
```

TASK-001 ~ TASK-003은 DONE이다.

각 Task 절은 "상태 / 목적 / Human Approval 또는 Gate / 완료 조건 / 상세 Task Contract" 형식으로 적는다(형식 규칙: [`docs/tasks/COMMON.md`](tasks/COMMON.md)).

---

## 4. 전체 Task 목록

| Task | Milestone | 작업 | 상태 | Dependency | Human Approval |
|---|---|---|---|---|---|
| TASK-001 | Milestone 1 | Requirements / Gate A | DONE | DEC-001 | Human 승인 2026-11-03 |
| TASK-002 | Milestone 2 | Project Bootstrap | DONE | TASK-001 (충족) | DEC-002 / DEC-008 |
| TASK-003 | Milestone 3 | AiClient / Fake / Anthropic / 비용 Guard | DONE | TASK-002 (충족) | DEC-004 / DEC-008 |
| TASK-004 | Milestone 3 | 이미지 업로드 검증 / 세로 분할 | READY | TASK-003 (충족) | DEC-008 |

---

## TASK-001 — Requirements / Gate A (제품 명세 · 기술 스택 · 데이터 수집 방식 결정)

### 상태

```text
DONE
```

Milestone 1. 선행: 없음.

- DEC-002 ~ DEC-005 권장안, DEC-006(분석 순서) 기록
- docs/01 · 03 · 04 · 05 · 06 초안
- TASK-002 Task 문서 / JSON Contract

### 목적

구현 전에 제품 범위와 핵심 기술 결정을 확정해 이후 Task Contract의 기준을 만든다.

### Human Approval 또는 Gate

- Gate A(기술 스택), 외부 연동 / 크롤링 범위, `docs/06-PLAN.md` 승인

### 완료 조건

- DEC-002 ~ DEC-005 확정 또는 명시적 보류
- `docs/06-PLAN.md` Human Approved
- TASK-002 Task 문서와 JSON Contract 등록

### 상세 Task Contract

[`docs/tasks/TASK-001_REQUIREMENTS_GATE.md`](tasks/TASK-001_REQUIREMENTS_GATE.md) (공통 규칙: [`docs/tasks/COMMON.md`](tasks/COMMON.md))

---

## TASK-002 — Project Bootstrap (Next.js / TypeScript / Test / verify 앱 단계)

### 상태

```text
DONE
```

Milestone 2. 선행: TASK-001.

- Next.js App Router 홈 / 분석 / 제작 자리 표시 화면, Tailwind, ESLint, Vitest 설정
- verify에 npm ci / lint / typecheck / test / build 단계 추가
- 화면 캡처 Script(`scripts/capture-screens.mjs`)

### 목적

DEC-002 기술 스택으로 빈 앱 골격을 만들고 verify에 앱 검증 단계를 추가한다.

### Human Approval 또는 Gate

- DEC-002 승인, 패키지 Version 목록 Gate C

### 완료 조건

- `bash scripts/verify.sh` 성공 (Harness Test + lint + typecheck + test + build)
- 승인 목록 밖 Dependency 없음

### 상세 Task Contract

[`docs/tasks/TASK-002_PROJECT_BOOTSTRAP.md`](tasks/TASK-002_PROJECT_BOOTSTRAP.md), [`harness/tasks/TASK-002.json`](../harness/tasks/TASK-002.json) (공통 규칙: [`docs/tasks/COMMON.md`](tasks/COMMON.md))

---

## TASK-003 — AiClient / Fake / Anthropic 구현 / 비용 Guard

### 상태

```text
DONE
```

Milestone 3. 선행: TASK-002.

- AiClient 인터페이스 / AiError, Fake, Anthropic(`messages.parse` + Zod Structured Output) 구현
- 월 비용 Guard(메모리 / JSON 파일 저장소), `createAiClient()`

### 목적

AI 호출 경계(AiClient)를 고정하고 Fake / Anthropic 구현과 월 비용 상한 Guard를 만든다.

### Human Approval 또는 Gate

- DEC-004 (Human Approved 2026-11-03), Dependency 설치는 DEC-008에 따라 Claude 세션 결정

### 완료 조건

- `bash scripts/verify.sh` 성공, Test는 네트워크 없이 통과
- `src/lib/ai` 밖에서 SDK import 없음

### 상세 Task Contract

[`docs/tasks/TASK-003_AI_CLIENT.md`](tasks/TASK-003_AI_CLIENT.md), [`harness/tasks/TASK-003.json`](../harness/tasks/TASK-003.json) (공통 규칙: [`docs/tasks/COMMON.md`](tasks/COMMON.md))

---

## TASK-004 — 이미지 업로드 검증 / 분석용 세로 분할

### 상태

```text
READY
```

Milestone 3. 선행: TASK-003.

### 목적

업로드한 상세페이지 캡처를 검증하고 Vision 분석용 조각으로 나눈다.

### Human Approval 또는 Gate

- sharp 직접 Dependency 추가: DEC-008에 따라 Claude 세션 결정 (DEC-002 부속)

### 완료 조건

- `bash scripts/verify.sh` 성공, 이미지 파일 Commit 없음

### 상세 Task Contract

[`docs/tasks/TASK-004_IMAGE_SLICING.md`](tasks/TASK-004_IMAGE_SLICING.md), [`harness/tasks/TASK-004.json`](../harness/tasks/TASK-004.json) (공통 규칙: [`docs/tasks/COMMON.md`](tasks/COMMON.md))

---

## 5. Human Approval 필요 Task

- 없음 (DEC-008 위임 예외 항목 발생 시 Human 확인)
