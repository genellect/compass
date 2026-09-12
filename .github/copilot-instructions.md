# GitHub Copilot Repository Instructions

`AGENTS.md` is the authoritative repository policy. `docs/CLOUD_DEVELOPMENT.md` defines the shared Codespaces, Docker, Codex, Claude Code, and VS Code workflow.

- Use `npm run dev:cloud` for browser development and `npm run cloud:check` for the repository gate.
- Select checks by changed risk under `docs/agent-delivery-policy.md`. Local UI changes need targeted routes/viewports/interactions; use `npm run check:responsive:cloud` for broad changes or explicit full audits. Do not duplicate a full CI suite locally by default. Visual baselines remain Windows-only.
- Cloud paths are Linux. Never propose `npm.cmd` or a `.ps1` script as the cloud workflow; the Library compose environment has `scripts/library-docker-dev.sh`.
- Keep COMPASS and COMPASS Interactive in separate repositories, containers, branches, and pull requests.
- Never generate, paste, log, or commit secrets, credentials, personal data, protected materials, or Production environment files.
- Keep runtime and deployment behavior unchanged unless the task explicitly places it in scope.
- A Web UI implementation request includes dedicated-branch commit/push, PR, Cloudflare Preview, and browser verification of the target Preview routes under AGENTS.md, including explicitly requested independent sites. Report actual PR/Preview URLs, not only localhost. Merge/Production and authentication changes remain separately authorized.
- For dependency and license work, follow docs/dependency-maintenance.md; preserve third-party rights.
