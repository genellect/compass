#!/usr/bin/env bash
# Claude Code SessionStart hook, registered in .claude/settings.json.
# All provisioning lives in scripts/dev-bootstrap.sh. --hook runs only in a
# Claude Code cloud session, never fails the session, prints a short summary
# for the agent, and persists environment changes through CLAUDE_ENV_FILE.
set -uo pipefail
repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
exec bash "$repo_root/scripts/dev-bootstrap.sh" --hook
