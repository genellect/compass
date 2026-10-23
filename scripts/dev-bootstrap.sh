#!/usr/bin/env bash
# Single, idempotent bootstrap for every COMPASS execution environment.
#
# Entry points only delegate here:
#   Dev Container / Codespaces  .devcontainer/post-create.sh       (--doctor)
#   Dev Container CLI setup     scripts/devcontainer.sh setup      (--doctor)
#   Codex Cloud setup           .codex/setup.sh
#   Codex Cloud maintenance     .codex/maintenance.sh              (--maintenance)
#   Claude Code cloud session   .claude/hooks/session-start.sh     (--hook)
#
# Options:
#   --profile <name>  devcontainer | codex-cloud | claude-cloud (default: detected)
#   --doctor          run .devcontainer/doctor.sh afterwards and return its status
#   --maintenance     also `git fetch --prune` (Codex maintenance after a cache resume)
#   --hook            Claude Code SessionStart mode: claude-cloud only, never fails
#                     the session, prints a short summary, persists env to CLAUDE_ENV_FILE
#
# Every step reports what happened, why, and what to do next. Without --hook the
# script exits 1 when a required step failed, after reporting every step.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
# shellcheck source=scripts/dev-profile.sh
source scripts/dev-profile.sh
# shellcheck source=.devcontainer/toolchain.env
source .devcontainer/toolchain.env

profile_arg=""
run_doctor=false
maintenance=false
hook=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) profile_arg="${2:-}"; shift 2 ;;
    --profile=*) profile_arg="${1#*=}"; shift ;;
    --doctor) run_doctor=true; shift ;;
    --maintenance) maintenance=true; shift ;;
    --hook) hook=true; shift ;;
    -h | --help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) printf '[bootstrap] Unknown option %s (see --help)\n' "$1" >&2; exit 2 ;;
  esac
done

if [[ -n "$profile_arg" ]]; then
  export COMPASS_DEV_PROFILE="$profile_arg"
fi
compass_detect_profile
profile="$COMPASS_PROFILE"
if ! compass_valid_profile "$profile"; then
  printf '[bootstrap] FAIL profile "%s" is unknown. Next: use one of: %s\n' "$profile" "$COMPASS_DEV_PROFILES" >&2
  exit 2
fi
export COMPASS_DEV_PROFILE="$profile"

if [[ "$hook" == true && "$profile" != "claude-cloud" ]]; then
  # Local Claude Code users already have a provisioned Dev Container or host;
  # the SessionStart hook must not run npm ci on a developer machine.
  printf '[compass-bootstrap] Skipped: profile %s is provisioned by its own entry point (see docs/CLOUD_DEVELOPMENT.md).\n' "$profile"
  exit 0
fi

tag="[bootstrap]"
if [[ "$hook" == true ]]; then
  tag="[compass-bootstrap]"
  # A SessionStart hook must never break the session: report and stop.
  trap 'printf "%s Bootstrap stopped unexpectedly at line %s. Next: run bash scripts/dev-bootstrap.sh to see the error.\n" "$tag" "$LINENO"; exit 0' ERR
fi
log_dir="${COMPASS_BOOTSTRAP_LOG_DIR:-${TMPDIR:-/tmp}/compass-bootstrap}"
mkdir -p "$log_dir"
summary=()
failures=0
warnings=0

report() {
  # report <OK|WARN|FAIL|SKIP> <step> <what and why> [next action]
  local level="$1" step="$2" message="$3" next="${4:-}"
  local line="$level $step: $message"
  [[ -n "$next" ]] && line+=" Next: $next"
  summary+=("$line")
  case "$level" in
    FAIL) failures=$((failures + 1)) ;;
    WARN) warnings=$((warnings + 1)) ;;
  esac
  if [[ "$hook" == false ]]; then
    if [[ "$level" == FAIL || "$level" == WARN ]]; then
      printf '%s %s\n' "$tag" "$line" >&2
    else
      printf '%s %s\n' "$tag" "$line"
    fi
  fi
  return 0
}

can_sudo() {
  [[ "$(id -u)" -eq 0 ]] || { command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; }
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; else sudo -n "$@"; fi
}

persist_env() {
  # Persist `export NAME=value` for later Bash commands of a Claude Code session.
  local line="$1"
  if [[ "$hook" == true && -n "${CLAUDE_ENV_FILE:-}" ]]; then
    touch "$CLAUDE_ENV_FILE"
    grep -Fqx "$line" "$CLAUDE_ENV_FILE" 2>/dev/null || printf '%s\n' "$line" >> "$CLAUDE_ENV_FILE"
  fi
}

step_git() {
  if ! command -v git >/dev/null 2>&1; then
    report FAIL git "git is not installed." "install git in the environment image; every workflow depends on it."
    return
  fi
  # A workspace owned by another uid (bind mounts, volumes) needs safe.directory.
  if [[ "$(stat -c %u "$repo_root" 2>/dev/null || echo "$(id -u)")" != "$(id -u)" ]] \
    && ! git config --global --get-all safe.directory 2>/dev/null | grep -Fqx "$repo_root"; then
    git config --global --add safe.directory "$repo_root"
    report OK git "added $repo_root to safe.directory (workspace owned by another user)."
  fi
  if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" != "true" ]]; then
    report FAIL git "$repo_root is not an operable Git worktree." "check ownership and safe.directory, then rerun."
    return
  fi
  git config --local fetch.prune true
  local fetched=""
  if [[ "$maintenance" == true ]]; then
    if git fetch --prune >"$log_dir/git-fetch.log" 2>&1; then
      fetched=" Remote branches fetched and pruned."
    else
      report WARN git "git fetch --prune failed (log: $log_dir/git-fetch.log)." "check network/GitHub access; local work can continue."
      return
    fi
  fi
  report OK git "worktree ready, fetch.prune enabled.$fetched"
}

node_bin_from_manager() {
  # Prints the bin directory of the pinned Node version from an existing
  # version manager. Never installs a manager or a global Node.
  local want="$1" exe=""
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    exe="$(
      set +eu
      # shellcheck disable=SC1091
      source "$nvm_dir/nvm.sh" >/dev/null 2>&1
      nvm install "$want" >"$log_dir/node-manager.log" 2>&1 && nvm which "$want" 2>/dev/null
    )" || true
  fi
  if [[ -z "$exe" ]] && command -v fnm >/dev/null 2>&1; then
    exe="$(fnm install "$want" >"$log_dir/node-manager.log" 2>&1 && fnm exec --using="$want" node -p process.execPath 2>/dev/null)" || true
  fi
  if [[ -z "$exe" ]] && command -v volta >/dev/null 2>&1; then
    exe="$(volta run --node "$want" node -p process.execPath 2>>"$log_dir/node-manager.log")" || true
  fi
  [[ -n "$exe" && -x "$exe" ]] && dirname "$exe"
}

step_node() {
  local want have manager_bin
  want="$(tr -d '\r\n ' < .node-version)"
  if ! command -v node >/dev/null 2>&1; then
    report FAIL node "node is not installed; .node-version requires $want." "provide Node $want in the environment (Dev Container feature, Codex/Claude environment settings)."
    return
  fi
  have="$(node -p 'process.versions.node')"
  if [[ "$have" == "$want" ]]; then
    report OK node "Node $have matches .node-version."
    return
  fi
  if manager_bin="$(node_bin_from_manager "$want")" && [[ -n "$manager_bin" ]]; then
    export PATH="$manager_bin:$PATH"
    persist_env "export PATH=\"$manager_bin:\$PATH\""
    report OK node "switched from Node $have to $want via a version manager ($manager_bin)."
    return
  fi
  if [[ "${have%%.*}" == "${want%%.*}" ]]; then
    report WARN node "running Node $have, .node-version pins $want; no nvm/fnm/volta found, continuing on the same major." "pin Node $want in the environment settings, or use the Dev Container for exact parity. dev:doctor shows this drift."
  else
    report FAIL node "running Node $have, .node-version pins $want (different major)." "switch the environment to Node $want; do not install a global Node to hide the drift."
  fi
}

ensure_writable() {
  local target
  for target in "$@"; do
    mkdir -p "$target" 2>/dev/null || true
    if [[ ! -w "$target" ]]; then
      if can_sudo; then
        as_root chown -R "$(id -u):$(id -g)" "$target"
      else
        report FAIL npm "$target is not writable and sudo is unavailable." "fix ownership of $target (Dev Container volumes are chowned automatically when sudo is available)."
        return 1
      fi
    fi
  done
}

step_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    report FAIL npm "npm is not installed." "provide Node $NODE_VERSION with npm."
    return
  fi
  local reason
  # Dev Container volumes (node_modules, ~/.npm, ~/.cache) start root-owned;
  # Playwright also writes to ~/.cache, so check them even when npm ci is skipped.
  ensure_writable node_modules "$HOME/.npm" "$HOME/.cache" || return 0
  if reason="$(node scripts/dev-env.cjs node-modules 2>&1)"; then
    report OK npm "node_modules already matches package-lock.json; npm ci skipped."
    return
  fi
  if npm ci --no-audit --no-fund >"$log_dir/npm-ci.log" 2>&1; then
    report OK npm "npm ci completed (${reason:-node_modules was out of date})."
  else
    report FAIL npm "npm ci failed (log: $log_dir/npm-ci.log)." "read the log; fix package-lock.json or the registry access. Do not switch to npm install."
  fi
}

step_playwright() {
  if [[ ! -x node_modules/.bin/playwright ]]; then
    report FAIL playwright "Playwright is not installed because node_modules is incomplete." "fix the npm step first."
    return
  fi
  local state browsers_dir with_deps=()
  state="$(node scripts/dev-env.cjs chromium 2>/dev/null || true)"
  browsers_dir="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

  if [[ "$state" == bundled* ]]; then
    if [[ "$profile" != devcontainer || ! -w "$browsers_dir" ]]; then
      report OK playwright "bundled Chromium ready (${state#bundled })."
      return
    fi
    # Dev Container caches survive a rebuild while OS packages do not, so the
    # idempotent --with-deps install still runs there.
  elif compass_truthy "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}"; then
    if [[ "$state" == fallback* ]]; then
      report OK playwright "bundled Chromium absent and downloads are disabled by the environment (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD); playwright.config.ts falls back to ${state##* }."
    else
      report FAIL playwright "no Chromium is installed and the environment disables downloads (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD)." "set PLAYWRIGHT_CHROMIUM_EXECUTABLE to a Chromium binary, or allow downloads in the environment settings."
    fi
    return
  fi

  if can_sudo && command -v apt-get >/dev/null 2>&1; then
    with_deps=(--with-deps)
  fi
  if npx --no-install playwright install "${with_deps[@]}" chromium >"$log_dir/playwright.log" 2>&1; then
    report OK playwright "Chromium installed for Playwright ${with_deps[*]:-(browser only; no root for OS packages)}."
    return
  fi
  state="$(node scripts/dev-env.cjs chromium 2>/dev/null || true)"
  case "$state" in
    bundled*) report WARN playwright "playwright install failed but bundled Chromium exists (log: $log_dir/playwright.log)." "if browsers fail to launch, install OS packages with 'sudo npx playwright install-deps chromium'." ;;
    fallback*) report WARN playwright "playwright install failed (log: $log_dir/playwright.log); using ${state##* } instead." "results may differ from the pinned browser; allow the download for exact parity." ;;
    *) report FAIL playwright "playwright install failed and no Chromium is available (log: $log_dir/playwright.log)." "allow network access to the Playwright CDN or set PLAYWRIGHT_CHROMIUM_EXECUTABLE." ;;
  esac
}

step_python() {
  if ! command -v uv >/dev/null 2>&1; then
    report FAIL python "uv is not installed; services/library-api cannot be synced." "Dev Container installs uv $UV_VERSION via the python feature; on Codex/Claude cloud add 'pip install uv==$UV_VERSION' to the environment setup."
    return
  fi
  local actual_uv
  actual_uv="$(uv --version 2>/dev/null | awk '{print $2}')"
  if [[ "$actual_uv" != "$UV_VERSION" ]]; then
    report WARN python "uv $actual_uv differs from the pinned $UV_VERSION; the lockfile is still enforced with --locked." "pin uv $UV_VERSION in the environment for exact parity."
  fi
  if (cd services/library-api && uv sync --locked --dev) >"$log_dir/uv-sync.log" 2>&1; then
    report OK python "Library API virtual environment synced from uv.lock (Python $(services/library-api/.venv/bin/python -c 'import platform; print(platform.python_version())' 2>/dev/null || echo unknown))."
  else
    report FAIL python "uv sync --locked --dev failed (log: $log_dir/uv-sync.log)." "read the log; Python $PYTHON_VERSION must be available or downloadable by uv."
  fi
}

started=$SECONDS
[[ "$hook" == false ]] && printf '%s profile %s (%s)\n' "$tag" "$profile" "$COMPASS_PROFILE_REASON"
step_git
step_node
step_npm
step_playwright
step_python

doctor_status=0
doctor_line=""
if [[ "$hook" == true ]]; then
  if bash .devcontainer/doctor.sh >"$log_dir/doctor.log" 2>&1; then
    doctor_line="doctor: $(tail -n 1 "$log_dir/doctor.log")"
  else
    doctor_line="doctor: NOT READY - $(grep -c ' FAIL ' "$log_dir/doctor.log" || true) failing check(s); run 'npm run dev:doctor' (log: $log_dir/doctor.log)"
  fi
fi

if [[ "$hook" == true ]]; then
  printf '%s profile %s, %ds, %d warning(s), %d failure(s)\n' "$tag" "$profile" "$((SECONDS - started))" "$warnings" "$failures"
  for line in "${summary[@]}"; do
    printf '%s %s\n' "$tag" "$line"
  done
  printf '%s %s\n' "$tag" "$doctor_line"
  printf '%s Gates: npm run dev:doctor | npm run check:repository | npm run cloud:check (broad changes only)\n' "$tag"
  printf '%s Read AGENTS.md before editing. Never deploy or send Production mail without an explicit request.\n' "$tag"
  exit 0
fi

if [[ "$failures" -ne 0 ]]; then
  printf '%s NOT READY: %d step(s) failed, %d warning(s). Logs: %s\n' "$tag" "$failures" "$warnings" "$log_dir" >&2
  exit 1
fi
printf '%s Bootstrap complete for %s in %ds (%d warning(s)).\n' "$tag" "$profile" "$((SECONDS - started))" "$warnings"

if [[ "$run_doctor" == true ]]; then
  bash .devcontainer/doctor.sh || doctor_status=$?
  exit "$doctor_status"
fi
