#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

npm ci
npx playwright install --with-deps chromium

if ! command -v uv >/dev/null 2>&1; then
  if command -v pipx >/dev/null 2>&1; then
    pipx install uv==0.11.28
  else
    python -m pip install --user uv==0.11.28
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi

(
  cd services/library-api
  uv sync --locked --dev
)

git config --local fetch.prune true
