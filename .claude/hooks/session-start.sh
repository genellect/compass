#!/usr/bin/env bash
# Bootstrap a Claude Code cloud session so tests and gates run without a manual
# setup turn. Mirrors .devcontainer/install-dependencies.sh, but stays fail-soft:
# a session must still start when an optional component is unavailable, and
# npm run dev:doctor / npm run cloud:check remain the authoritative gates.
set -uo pipefail

repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$repo_root" || exit 0

# Local machines already have a provisioned Dev Container; only cloud sessions
# start from a bare checkout.
if [[ "${CLAUDE_CODE_REMOTE:-}" != "true" ]]; then
  exit 0
fi

status_lines=()

note() {
  printf '[compass-bootstrap] %s\n' "$1"
  status_lines+=("$1")
}

# 1. JavaScript dependencies from the canonical lockfile.
if [[ -d node_modules/.bin && -f node_modules/.package-lock.json ]]; then
  note "OK   npm dependencies already installed"
elif npm ci --no-audit --no-fund >/tmp/compass-npm-ci.log 2>&1; then
  note "OK   npm ci completed"
else
  note "WARN npm ci failed; see /tmp/compass-npm-ci.log (run 'npm ci' manually)"
fi

# 2. Playwright Chromium for the responsive gate. --with-deps needs root, so
# install the browser only and let the doctor report a genuinely broken host.
if [[ -x node_modules/.bin/playwright ]]; then
  if npx --no-install playwright install chromium >/tmp/compass-playwright.log 2>&1; then
    note "OK   Playwright Chromium ready"
  else
    note "WARN Chromium unavailable (see /tmp/compass-playwright.log); responsive gates cannot run in this session - report them as not executed"
  fi
else
  note "WARN Playwright is not installed; responsive gates are unavailable"
fi

# 3. Library API virtual environment. Optional for web-only tasks.
if command -v uv >/dev/null 2>&1; then
  if (cd services/library-api && uv sync --locked --dev) >/tmp/compass-uv-sync.log 2>&1; then
    note "OK   Library API virtual environment ready"
  else
    note "WARN uv sync failed; see /tmp/compass-uv-sync.log (Python gates unavailable)"
  fi
else
  note "WARN uv is missing; Library API gates are unavailable"
fi

printf '\n[compass-bootstrap] Cloud session ready.\n'
printf '[compass-bootstrap] Repository gate: npm run cloud:check\n'
printf '[compass-bootstrap] Responsive gate: npm run check:responsive:cloud\n'
printf '[compass-bootstrap] Read AGENTS.md before editing. Never deploy or send Production mail without an explicit request.\n'

for line in "${status_lines[@]}"; do
  case "$line" in
    WARN*) printf '[compass-bootstrap] %s\n' "$line" ;;
  esac
done

exit 0
