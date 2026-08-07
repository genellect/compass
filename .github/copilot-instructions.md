# GitHub Copilot Repository Instructions

`AGENTS.md` is the authoritative repository policy. `docs/CLOUD_DEVELOPMENT.md` defines the shared Codespaces, Docker, Codex, Claude Code, and VS Code workflow.

- Use `npm run dev:cloud` for browser development and `npm run cloud:check` for the repository gate.
- Keep COMPASS and COMPASS Interactive in separate repositories, containers, branches, and pull requests.
- Never generate, paste, log, or commit secrets, credentials, personal data, protected materials, or Production environment files.
- Keep runtime and deployment behavior unchanged unless the task explicitly places it in scope.
- Prefer a Draft Pull Request and include the exact validation performed.
