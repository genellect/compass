# Third-party notices

Status: Canonical Index
Scope: Third-party software and assets used by this repository
Last verified: 2026-09-10

The [COMPASS license](LICENSE) covers only rights owned or controlled by Yuto Matsui.
Third-party components keep their own licenses, including permissions for commercial
use, modification and redistribution where their licenses grant them. Inclusion here
does not imply endorsement. Missing inventory entries do not override third-party rights.

## Software

`package-lock.json` and `services/library-api/uv.lock` identify exact dependencies.
Generate the reviewed inventories with `npm run licenses:check` and
`uv run --project services/library-api --locked python scripts/audit-python-dependencies.py --licenses-only`. The Python command uses
installed distribution metadata after `uv sync --locked --dev`; it does not install packages.
Reports distinguish installed software from the cross-platform npm lockfile inventory.

[Browser core notices](docs/legal/browser-core-notices.txt) preserve the installed
license texts for Next.js, React, React DOM, Three.js, Zod, Scheduler and styled-jsx.
This named collection does not cover every vendored module or transitive dependency.

| Family | License / handling |
|---|---|
| Next.js, React, Three.js, Zod and many JS tools | Retain the applicable MIT copyright and permission notices when distributing covered code |
| Apache-2.0 packages, including sharp's JS wrapper | Retain license/NOTICE material and any required modification notices |
| sharp/libvips native components | LGPL-3.0-or-later, sometimes combined with Apache-2.0/MIT; inspect the actual platform binary and redistribution obligations |
| lightningcss and its platform binaries | MPL-2.0; distinguish build-tool use from distribution or modification of covered files |
| caniuse-lite | CC-BY-4.0; retain required attribution where applicable |
| Python API and test dependencies | Inspect each installed distribution's license expression, license files and notices; do not infer a license from the application license |

Build-only use does not by itself make the site's output a derivative work of every
tool. Conversely, a public Git repository, browser bundle and distributed container
are different distribution surfaces. Before distributing a new binary or image,
review the actual included files and satisfy their notice/source/relinking obligations.
An inventory is not a substitute for shipping required license texts and notices.

## Media and authorship

The `next/font/google` imports use Manrope and Newsreader under SIL OFL 1.1.
Their upstream notices are retained as [Manrope](docs/legal/fonts/Manrope-OFL.txt)
and [Newsreader](docs/legal/fonts/Newsreader-OFL.txt), obtained from the
[Google Fonts repository](https://github.com/google/fonts/tree/main/ofl) on
2026-09-10. The website build downloads and self-hosts the font files. Include
the applicable notices when distributing those files; changes to deployed notice
delivery must follow the production approval boundary.

See the [asset register](docs/legal/asset-register.md). Existing notices are preserved:

- [Habitat source credits](scripts/habitat/ASSET_CREDITS.md) and [delivered credits](public/habitat/v3/credits.md)
- [NASA mobile media provenance](docs/mobile-space-media.md) and [manifest](public/habitat/mobile-v1/manifest.json)
- [Independent portfolio image credits](docs/founder-image-credits.md)
- [Original Contact rendering](docs/contact-door-entry.md)

Poly Haven CC0 assets remain CC0. NASA imagery is governed by NASA's media policy
and any item-specific third-party rights; NASA logos and endorsement are not granted.
Unsplash and Pexels items retain their source terms. User-supplied photos and original
artwork must not be described as third-party stock or relicensed without authority.

## Review policy

Unknown or newly introduced license expressions require a recorded review before
acceptance. Copyleft expressions are reviewed by use and distribution scope, not
automatically treated as vulnerabilities or automatically waived. See
[dependency maintenance](docs/dependency-maintenance.md) for checks and review records.
