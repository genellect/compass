#!/usr/bin/env bash
# Environment doctor (npm run dev:doctor). Checks the contract of the detected
# profile and reports every item in one run:
#   devcontainer  strict: exact pins, Docker daemon, Compose, Copilot CLI
#   claude-cloud  Claude Code cloud session (default development environment)
#   codex-cloud   Codex Cloud environment
# PASS/FAIL are required items, WARN is tolerated drift that is shown but does
# not fail, SKIP is an item this profile does not provide (with its alternative).
# Override detection with COMPASS_DEV_PROFILE=<profile>.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
# shellcheck source=.devcontainer/toolchain.env
source .devcontainer/toolchain.env
# shellcheck source=scripts/dev-profile.sh
source scripts/dev-profile.sh

compass_detect_profile
profile="$COMPASS_PROFILE"
if ! compass_valid_profile "$profile"; then
  printf '[doctor] FAIL unknown profile "%s" (expected one of: %s)\n' "$profile" "$COMPASS_DEV_PROFILES" >&2
  exit 2
fi
strict=false
[[ "$profile" == devcontainer ]] && strict=true

failures=0
warnings=0

pass() { printf '[doctor] PASS %s\n' "$1"; }
fail() { printf '[doctor] FAIL %s\n' "$1" >&2; failures=$((failures + 1)); }
warn() { printf '[doctor] WARN %s\n' "$1" >&2; warnings=$((warnings + 1)); }
skip() { printf '[doctor] SKIP %s\n' "$1"; }
has_command() { command -v "$1" >/dev/null 2>&1; }

# Exact pin in the Dev Container; tolerated (shown) drift in cloud profiles.
version_check() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label $actual"
  elif [[ "$strict" == true || -z "$actual" ]]; then
    fail "$label ${actual:-unavailable} (expected $expected)"
  else
    warn "$label $actual differs from the pinned $expected (tolerated in $profile; exact in the Dev Container)"
  fi
}

printf '[doctor] profile %s (%s)\n' "$profile" "$COMPASS_PROFILE_REASON"

# Report every failure in one run. A missing command must not abort the script
# under `set -e`, or the remaining checks never reach the operator.
required_commands=(git node npm npx uv)
[[ "$strict" == true ]] && required_commands+=(pnpm gh copilot docker python)
for command_name in "${required_commands[@]}"; do
  if has_command "$command_name"; then pass "$command_name command"; else fail "$command_name command is missing"; fi
done

if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" == "true" ]]; then
  pass "operable Git worktree"
else
  fail "workspace is not an operable Git worktree"
fi

pinned_node="$(tr -d '\r\n' < .node-version)"
if [[ "$pinned_node" != "$NODE_VERSION" ]]; then
  fail ".node-version $pinned_node differs from toolchain.env NODE_VERSION $NODE_VERSION"
fi
if has_command node; then
  actual_node="$(node -p 'process.versions.node' 2>/dev/null || true)"
  if [[ "$actual_node" == "$pinned_node" ]]; then
    pass "Node.js $actual_node"
  elif [[ "$strict" == false && "${actual_node%%.*}" == "${pinned_node%%.*}" ]]; then
    warn "Node.js $actual_node differs from .node-version $pinned_node (same major; pin it in the environment settings for exact parity)"
  else
    fail "Node.js ${actual_node:-unavailable} (expected $pinned_node)"
  fi
fi

if [[ "$strict" == true ]]; then
  if has_command pnpm; then version_check "pnpm CLI" "$(pnpm --version 2>/dev/null || true)" "$PNPM_VERSION"; fi
  if has_command python; then
    version_check "Python" "$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)" "$PYTHON_VERSION"
  fi
else
  skip "pnpm CLI (auxiliary; npm/package-lock is canonical)"
fi

if [[ -f package-lock.json && ! -f pnpm-lock.yaml ]]; then
  pass "canonical npm package-lock"
else
  fail "package manager boundary must remain npm with package-lock.json"
fi

if has_command uv; then
  version_check "uv" "$(uv --version 2>/dev/null | awk '{print $2}' || true)" "$UV_VERSION"
fi

if has_command gh; then
  version_check "GitHub CLI" "$(gh --version 2>/dev/null | head -n 1 | awk '{print $3}' || true)" "$GITHUB_CLI_VERSION"
elif [[ "$strict" == false ]]; then
  skip "GitHub CLI (not provided by $profile; use the agent's GitHub integration)"
fi

if [[ "$strict" == true ]]; then
  if has_command copilot; then
    version_check "GitHub Copilot CLI" "$(copilot --version 2>/dev/null | head -n 1 | awk '{print $4}' | sed 's/\.$//' || true)" "$COPILOT_CLI_VERSION"
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
    version_check "Docker Compose" "$(docker compose version --short 2>/dev/null || true)" "$DOCKER_COMPOSE_VERSION"
  fi
fi

if [[ -x node_modules/.bin/playwright ]]; then
  pass "Playwright dependency"
else
  fail "Playwright dependency is missing; run bash scripts/dev-bootstrap.sh"
fi

if has_command node; then
  if lock_state="$(node scripts/dev-env.cjs node-modules 2>&1)"; then
    pass "node_modules matches package-lock.json"
  else
    fail "node_modules is out of date ($lock_state); run bash scripts/dev-bootstrap.sh"
  fi
  chromium_state="$(node scripts/dev-env.cjs chromium 2>/dev/null || true)"
  case "$chromium_state" in
    bundled*) pass "Playwright Chromium (bundled ${chromium_state#bundled })" ;;
    fallback*)
      if [[ "$strict" == true ]]; then
        fail "bundled Playwright Chromium is missing (only ${chromium_state##* }); run bash scripts/dev-bootstrap.sh"
      else
        warn "bundled Playwright Chromium is missing; playwright.config.ts falls back to ${chromium_state##* } (${chromium_state#fallback }); revision may differ from the pinned Playwright"
      fi
      ;;
    *) fail "no Chromium for Playwright; run bash scripts/dev-bootstrap.sh or set PLAYWRIGHT_CHROMIUM_EXECUTABLE" ;;
  esac
fi

venv_python="services/library-api/.venv/bin/python"
if [[ -x "$venv_python" ]]; then
  venv_version="$("$venv_python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
  if [[ "$venv_version" == "$PYTHON_VERSION" ]]; then
    pass "locked Library API virtual environment (Python $venv_version)"
  else
    fail "Library API virtual environment uses Python ${venv_version:-unknown} (expected $PYTHON_VERSION); run bash scripts/dev-bootstrap.sh"
  fi
else
  fail "Library API virtual environment is missing; run bash scripts/dev-bootstrap.sh"
fi

if [[ "$strict" == false ]]; then
  # Keep this list identical to "Claude Code cloudで実行できないもの" in
  # docs/CLOUD_DEVELOPMENT.md (guarded by tests/repository-maintenance.test.mjs).
  skip "Docker daemon / Compose: Library PostgreSQL (library-docker-dev.sh Up/Test/Phase9Phase10Test) -> Codespaces"
  skip "Docker images and Terraform: library-docker-dev.sh BuildProductionImages/TerraformValidate -> Codespaces"
  skip "Dev Container contract (devcontainer profile of dev:doctor) -> GitHub Actions Dev Container Contract"
  skip "Windows PowerShell scripts (*.ps1, rehearse:library-production) -> GitHub Actions Library production artifact rehearsal / Windows host"
  skip "H.264 film decode and GPU 3D scene (test:responsive:media, film/3D cases of interactive-hero.spec.ts) -> Cloudflare Preview real display / Windows host"
  skip "msedge Explorer specs and Windows visual regression (test:responsive:explorer, test:responsive:visual) -> Windows host"
fi

if [[ "$failures" -ne 0 ]]; then
  printf '[doctor] NOT READY %s: %d check(s) failed, %d warning(s).\n' "$profile" "$failures" "$warnings" >&2
  printf '[doctor] Run bash scripts/dev-bootstrap.sh, then see docs/CLOUD_DEVELOPMENT.md for the %s contract.\n' "$profile" >&2
  exit 1
fi

printf '[doctor] READY %s environment matches its contract (%d warning(s)).\n' "$profile" "$warnings"
