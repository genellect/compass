---
description: Run the COMPASS repository gate and report exactly what passed, failed, and was skipped.
---

Run the repository-wide gate for this change.

```bash
npm run cloud:check
```

This is the canonical gate defined in `AGENTS.md`: public-source boundary, Community/Contact tests, Library registration and release-gate tests, TypeScript, Production build, static export verification, and the Playwright responsive smoke across every public route.

Rules for reporting the result:

- Report per stage, not as a single verdict. Name the stage that failed and quote the actual error.
- If the Playwright stage cannot start because Chromium is unavailable in this environment, say the responsive smoke was **not executed**. Do not describe the run as passing.
- Never edit canonical copy, backgrounds, or layout just to make a responsive assertion pass. If an assertion is wrong, report the contract mismatch and stop.
- If you ran only part of the gate, list what you skipped and why.

Do not commit, push, or deploy as part of this command.
