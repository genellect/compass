#!/usr/bin/env bash
# Codex Cloud maintenance script (a cached container resumed for a new task).
# All provisioning lives in scripts/dev-bootstrap.sh.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/dev-bootstrap.sh" --profile codex-cloud --maintenance
