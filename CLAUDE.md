# Claude Code Instructions

Read and follow `AGENTS.md` first. Use `docs/CLOUD_DEVELOPMENT.md` for environment setup, Docker/Dev Container commands, verification, isolation, and secret handling.

- Treat GitHub as the canonical source and work on a dedicated branch.
- Use the repository-provisioned environment (`scripts/dev-bootstrap.sh`, or the Dev Container) instead of creating a separate machine-specific environment.
- Select risk-proportionate checks using `docs/agent-delivery-policy.md`. Reserve `npm run cloud:check` for broad changes, explicit full audits, and CI; do not repeat the full suite for local UI refinements.
- Never copy local `.env*`, credentials, protected materials, or Production data into this repository or a cloud environment.
- Web UI implementation includes a dedicated branch, commit/push, PR, Cloudflare Preview, and browser verification of its target routes under AGENTS.md, including explicitly requested independent sites. Do not stop at localhost. Production deployment/merge, real forms/email, migrations, and secret changes require separate authorization.

## Position in this repository

Claude Code cloud (claude.ai/code) is the default development environment for COMPASS (user decision, 2026-10-23). Codex (Desktop and Cloud) and GitHub Codespaces / the Dev Container are equally supported paths, and they take the work Claude Code cloud cannot run (Docker, Windows-only scripts; see `docs/CLOUD_DEVELOPMENT.md`). Another agent's branch may already be in progress: read the diff before proposing work, keep the change scoped to what was asked, and never run a write-capable agent on a branch another agent is holding.

`AGENTS.md` is the only policy source. `.claude/` carries execution setup only and never overrides it.

## Workspace assets

- `.claude/settings.json` — committed and shared. Registers the SessionStart hook and the Dev Container session env only; no permission allowlist.
- `.claude/hooks/session-start.sh` — delegates to `scripts/dev-bootstrap.sh --hook` in cloud sessions: npm, Playwright Chromium (with the `/opt/pw-browsers` fallback), and the Library API environment, then a doctor summary. Rerun `bash scripts/dev-bootstrap.sh` when it reports a problem.
- `.claude/settings.json.example` — optional personal permission allowlist and `deny` boundary; review it, then copy `permissions` into your own `.claude/settings.local.json`.
- `.claude/agents/` — read-only `repo-mapper`, `quality-reviewer`, and `security-reviewer`, mirroring `.codex/agents/`.
- `.claude/commands/` — `/cloud-check`, `/responsive-check`, `/handoff`.

## Gates

| Scope | Command |
|---|---|
| Repository-wide | `npm run cloud:check` |
| Local UI / navigation / animation | Target routes, Desktop/Mobile, changed interactions; follow `docs/agent-delivery-policy.md` |
| Broad responsive changes / explicit full audit | `npm run check:responsive:cloud` |
| Environment contract (profile auto-detected: `claude-cloud` / `codex-cloud` / `devcontainer`) | `npm run dev:doctor` |

Required GitHub checks are **CI result** and **Library security result** (see AGENTS.md). Browser responsive checks are not a CI gate; the Cloudflare Preview is the visual acceptance surface.

`npm run check:responsive:full` and every `.ps1` script are Windows-only. Do not invoke them from a cloud session; report visual regression as not run.
