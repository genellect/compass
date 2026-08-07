---
description: Run the cloud-executable responsive audit for a UI, navigation, font, breakpoint, or animation change.
---

Run the responsive gate that is executable on Linux and in the cloud.

```bash
npm run check:responsive:cloud
```

This covers the full viewport matrix, breakpoint boundaries, interaction contracts, the interactive hero, manifesto chapters, semantic line breaking, and mobile-device emulation.

What this gate does **not** cover: `tests/responsive/visual-regression.spec.ts`. Its baselines are Windows-generated `*-win32.png` files, so Linux cannot execute or update them. Per `docs/responsive-browser-qa.md`, baselines are regenerated on Windows only, after UI approval, by a human.

So when reporting:

- State that visual regression was not run in this environment, and that the GitHub Actions **Responsive Quality Gate** owns that judgement.
- Never run `test:responsive:update-snapshots` from a cloud session. It would write Linux baselines beside the approved Windows set.
- Record CSS viewport, height boundaries, DPR, rendered line counts, overflow, and console output — not physical resolution alone.

Read `docs/responsive-browser-qa.md` before interpreting a failure.
