# Claude Code Instructions

Read and follow `AGENTS.md` first. Use `docs/CLOUD_DEVELOPMENT.md` for environment setup, Docker/Dev Container commands, verification, isolation, and secret handling.

- Treat GitHub as the canonical source and work on a dedicated branch.
- Use the repository Dev Container instead of creating a separate machine-specific environment.
- Run `npm run cloud:check` before handing work off.
- Never copy local `.env*`, credentials, protected materials, or Production data into this repository or a cloud environment.
- Do not deploy, submit Production forms, send real email, migrate databases, or change secrets without an explicit user request for that external action.
