# shellcheck shell=bash
# Sourced by scripts/dev-bootstrap.sh and .devcontainer/doctor.sh.
# Decides which execution environment contract applies:
#   devcontainer  Codespaces, VS Code Dev Containers, Dev Container CLI (strict, canonical)
#   codex-cloud   Codex Cloud environment (no Docker; pinned via Codex settings)
#   claude-cloud  Claude Code cloud session on claude.ai/code (no Docker)
# COMPASS_DEV_PROFILE overrides detection. Unknown hosts use the strict
# devcontainer contract so a missing requirement is never silently skipped.

COMPASS_DEV_PROFILES="devcontainer codex-cloud claude-cloud"

# Sets COMPASS_PROFILE and COMPASS_PROFILE_REASON in the calling shell.
compass_detect_profile() {
  if [[ -n "${COMPASS_DEV_PROFILE:-}" ]]; then
    COMPASS_PROFILE="$COMPASS_DEV_PROFILE"
    COMPASS_PROFILE_REASON="COMPASS_DEV_PROFILE"
  elif [[ "${CODESPACES:-}" == "true" || "${REMOTE_CONTAINERS:-}" == "true" ]]; then
    COMPASS_PROFILE="devcontainer"
    COMPASS_PROFILE_REASON="CODESPACES/REMOTE_CONTAINERS"
  elif [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]]; then
    COMPASS_PROFILE="claude-cloud"
    COMPASS_PROFILE_REASON="CLAUDE_CODE_REMOTE=true"
  elif [[ -n "$(compgen -e | grep '^CODEX_' || true)" ]]; then
    COMPASS_PROFILE="codex-cloud"
    COMPASS_PROFILE_REASON="CODEX_* environment"
  else
    COMPASS_PROFILE="devcontainer"
    COMPASS_PROFILE_REASON="default (strict Dev Container contract)"
  fi
}

compass_valid_profile() {
  [[ " $COMPASS_DEV_PROFILES " == *" $1 "* ]]
}

compass_truthy() {
  case "${1:-}" in
    "" | 0 | false | FALSE | False | no | off) return 1 ;;
    *) return 0 ;;
  esac
}
