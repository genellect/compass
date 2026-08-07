---
description: Produce the AGENTS.md final report for the current change, ready to paste into a Draft PR.
---

Produce the final report required by `AGENTS.md` for the work in this session.

Gather the facts first — `git status`, `git diff --stat`, and the actual output of any gate you ran. Do not reconstruct results from memory.

Then output exactly these sections:

**変更ファイル** — every changed path, grouped by area.

**User-visible behavior** — whether public UI, copy, routes, or form behavior changed. If nothing user-visible changed, say so explicitly.

**実行した検証** — each command you ran and its real result. Separate what passed, what failed, and what you did not run. Anything not executed in this environment (for example the browser gate without Chromium, or the Windows-only visual regression) is listed as not executed, never as passing.

**実施したGit・Production操作** — commits, pushes, and branch. Cloudflare, GAS, Terraform, database, and secret operations must be listed as none unless the user explicitly requested them.

**未確認事項と残存risk** — external state this repository cannot prove: Cloudflare dashboard configuration, GAS deployment state, real email delivery, Production data.

Use the status vocabulary from `AGENTS.md`. Do not report `Planned` or `Implemented, verification pending` work as `Production`, and do not present design targets or mock data as Production results.
