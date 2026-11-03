#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

run_step() {
  name=$1
  shift
  printf '\n==> %s\n' "$name"
  "$@"
}

# 승인된 Node.js Version은 .nvmrc를 기준으로 한다. 불일치 시 경고만 출력한다.
EXPECTED_NODE=$(head -n 1 "$ROOT_DIR/.nvmrc" | tr -d ' \r\n')
# WSL처럼 Windows Node.js를 node.exe로만 실행할 수 있는 Shell도 확인한다.
ACTUAL_NODE=$( (node --version 2>/dev/null || node.exe --version 2>/dev/null) | sed 's/^v//' | tr -d '\r' || true)
if [ -z "$ACTUAL_NODE" ]; then
  printf 'WARNING: Node.js version could not be detected (node / node.exe not found). .nvmrc expects %s.\n' "$EXPECTED_NODE" >&2
elif [ "$ACTUAL_NODE" != "$EXPECTED_NODE" ]; then
  printf 'WARNING: Node.js %s is in use, but .nvmrc expects %s (CI uses %s).\n' "$ACTUAL_NODE" "$EXPECTED_NODE" "$EXPECTED_NODE" >&2
else
  printf 'Node.js %s (matches .nvmrc)\n' "$ACTUAL_NODE"
fi

run_step "Harness orchestrator test" sh -c "cd '$ROOT_DIR' && node --test scripts/orchestrator/*.test.mjs"

# 앱 검증 단계(install / lint / test / build)는 Gate A 기술 스택 승인 후 추가한다.

printf '\nLocal verification passed.\n'
