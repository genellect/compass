#!/usr/bin/env bash
# Codex Cloud environment setup script. All provisioning lives in
# scripts/dev-bootstrap.sh.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/dev-bootstrap.sh" --profile codex-cloud
