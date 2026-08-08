# Claude Code Instructions

Read and follow `AGENTS.md` first. Use `docs/CLOUD_DEVELOPMENT.md` for environment setup, Docker/Dev Container commands, verification, isolation, and secret handling.

- Treat GitHub as the canonical source and work on a dedicated branch.
- Use the repository Dev Container instead of creating a separate machine-specific environment.
- Run `npm run cloud:check` before handing work off.
- Never copy local `.env*`, credentials, protected materials, or Production data into this repository or a cloud environment.
- Do not deploy, submit Production forms, send real email, migrate databases, or change secrets without an explicit user request for that external action.

## Position in this repository

Codex Desktop is the primary agent environment for COMPASS. Claude Code is a secondary participant used for review and focused adjustments. Assume a Codex-authored branch may already be in progress: read the diff before proposing work, keep the change scoped to what was asked, and never run a write-capable agent on a branch another agent is holding.

`AGENTS.md` is the only policy source. `.claude/` carries execution setup only and never overrides it.

## Workspace assets

- `.claude/hooks/session-start.sh` — installs npm, Playwright, and the Library API environment at session start. Activated by `.claude/settings.json`; copy `.claude/settings.json.example` to enable it along with the permission boundary.
- `.claude/agents/` — read-only `repo-mapper`, `quality-reviewer`, and `security-reviewer`, mirroring `.codex/agents/`.
- `.claude/commands/` — `/cloud-check`, `/responsive-check`, `/handoff`.

## Gates

| Scope | Command |
|---|---|
| Repository-wide | `npm run cloud:check` |
| UI / navigation / font / breakpoint / animation | `npm run check:responsive:cloud` |
| Environment contract | `npm run dev:doctor` |

`npm run check:responsive:full` and every `.ps1` script are Windows-only. Do not invoke them from a cloud session; report visual regression as owned by the GitHub Actions **Responsive Quality Gate**.
