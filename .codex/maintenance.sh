#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

git fetch --prune
npm ci
npx --no-install playwright install chromium
(
  cd services/library-api
  uv sync --locked --dev
)
