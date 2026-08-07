#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
source .devcontainer/toolchain.env

failures=0

pass() {
  printf '[doctor] PASS %s\n' "$1"
}

fail() {
  printf '[doctor] FAIL %s\n' "$1" >&2
  failures=$((failures + 1))
}

skip() {
  printf '[doctor] SKIP %s\n' "$1" >&2
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  if has_command "$1"; then
    pass "$1 command"
  else
    fail "$1 command is missing"
  fi
}

# Report every failure in one run. A missing command must not abort the script
# under `set -e`, or the remaining checks never reach the operator.
for command_name in git node npm npx pnpm gh copilot docker python uv; do
  require_command "$command_name"
done

if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" == "true" ]]; then
  pass "operable Git worktree"
else
  fail "workspace is not an operable Git worktree"
fi

if has_command node; then
  actual_node="$(node -p 'process.versions.node' 2>/dev/null || true)"
  if [[ "$actual_node" == "$NODE_VERSION" && "$(tr -d '\r\n' < .node-version)" == "$NODE_VERSION" ]]; then
    pass "Node.js $actual_node"
  else
    fail "Node.js ${actual_node:-unavailable} (expected $NODE_VERSION)"
  fi
else
  skip "Node.js version check (node is missing)"
fi

if has_command pnpm; then
  actual_pnpm="$(pnpm --version 2>/dev/null || true)"
  if [[ "$actual_pnpm" == "$PNPM_VERSION" ]]; then
    pass "pnpm CLI $actual_pnpm"
  else
    fail "pnpm CLI ${actual_pnpm:-unavailable} (expected $PNPM_VERSION)"
  fi
else
  skip "pnpm version check (pnpm is missing)"
fi

if [[ -f package-lock.json && ! -f pnpm-lock.yaml ]]; then
  pass "canonical npm package-lock"
else
  fail "package manager boundary must remain npm with package-lock.json"
fi

if has_command python; then
  actual_python="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
  if [[ "$actual_python" == "3.12" ]]; then
    pass "Python $actual_python"
  else
    fail "Python ${actual_python:-unavailable} (expected 3.12)"
  fi
else
  skip "Python version check (python is missing)"
fi

if has_command uv; then
  actual_uv="$(uv --version 2>/dev/null | awk '{print $2}' || true)"
  if [[ "$actual_uv" == "$UV_VERSION" ]]; then
    pass "uv $actual_uv"
  else
    fail "uv ${actual_uv:-unavailable} (expected $UV_VERSION)"
  fi
else
  skip "uv version check (uv is missing)"
fi

if has_command docker; then
  docker_server=""
  for _ in $(seq 1 30); do
    if docker_server="$(docker info --format '{{.ServerVersion}}' 2>/dev/null)"; then
      break
    fi
    sleep 1
  done

  if [[ "$docker_server" == "$DOCKER_VERSION"* ]]; then
    pass "isolated Docker daemon $docker_server"
  else
    fail "Docker daemon ${docker_server:-unavailable} (expected $DOCKER_VERSION)"
  fi

  compose_version="$(docker compose version --short 2>/dev/null || true)"
  if [[ "$compose_version" == "$DOCKER_COMPOSE_VERSION" ]]; then
    pass "Docker Compose $compose_version"
  else
    fail "Docker Compose ${compose_version:-unavailable} (expected $DOCKER_COMPOSE_VERSION)"
  fi
else
  skip "Docker daemon and Compose checks (docker is missing)"
fi

if has_command gh; then
  gh_version="$(gh --version 2>/dev/null | head -n 1 | awk '{print $3}' || true)"
  if [[ "$gh_version" == "$GITHUB_CLI_VERSION" ]]; then
    pass "GitHub CLI $gh_version"
  else
    fail "GitHub CLI ${gh_version:-unavailable} (expected $GITHUB_CLI_VERSION)"
  fi
else
  skip "GitHub CLI version check (gh is missing)"
fi

if has_command copilot; then
  copilot_version="$(copilot --version 2>/dev/null | head -n 1 | awk '{print $4}' | sed 's/\.$//' || true)"
  if [[ "$copilot_version" == "$COPILOT_CLI_VERSION" ]]; then
    pass "GitHub Copilot CLI $copilot_version"
  else
    fail "GitHub Copilot CLI ${copilot_version:-unavailable} (expected $COPILOT_CLI_VERSION)"
  fi
else
  skip "GitHub Copilot CLI version check (copilot is missing)"
fi

if [[ -x node_modules/.bin/playwright ]]; then
  pass "Playwright dependency"
else
  fail "Playwright dependency is missing; run npm ci"
fi

if [[ -d services/library-api/.venv ]]; then
  pass "locked Library API virtual environment"
else
  fail "Library API virtual environment is missing"
fi

if [[ "$failures" -ne 0 ]]; then
  printf '[doctor] Environment is not ready: %d check(s) failed.\n' "$failures" >&2
  printf '[doctor] This doctor describes the Dev Container contract in .devcontainer/devcontainer.json.\n' >&2
  printf '[doctor] Outside that container (for example Codex Cloud or a bare runner) failures are expected;\n' >&2
  printf '[doctor] see docs/CLOUD_DEVELOPMENT.md for which checks each execution path is required to satisfy.\n' >&2
  exit 1
fi

printf '[doctor] READY COMPASS Dev Container is reproducible and ready.\n'
