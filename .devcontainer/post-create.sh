#!/usr/bin/env bash
# Dev Container / Codespaces postCreateCommand. All provisioning lives in
# scripts/dev-bootstrap.sh; --doctor makes container creation fail closed.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/dev-bootstrap.sh" --profile devcontainer --doctor
