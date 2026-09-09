# Independent website boundaries

2026-09-09 user instruction. This boundary applies to future COMPASS work as well as the current design change.

| Surface | Sources / routes | Default COMPASS editing scope |
| --- | --- | --- |
| COMPASS official | `/`, `/future-strategy-library/`, `/messages/`, `/contact/`, `/community/join/`; `SiteHeader`, `SiteFooter`, route CSS Modules | Included when relevant to the named task |
| Interactive introduction | `src/app/(interactive)/`, `src/interactive/`; `/INTRO_Interactive/` | Independent; excluded without a named request |
| Developer introduction | `/INTRO_Interactive/developers/`, `src/interactive/DeveloperApp.tsx` and its assets | Excluded; do not proactively edit or add promotional links during COMPASS work |
| Interactive product | Separate repository and deployment | Independent; excluded |
| yuto-matsui.com Japanese | `src/app/(official)/founder/`, its assets, host routing in `functions/index.ts` | Independent website, not a COMPASS child |
| yuto-matsui.com English | `src/app/(founder-en)/en/`, its assets and English host routing | Same independent website; excluded |

The personal site's domain, purpose and value are independent of COMPASS. Shared Git, Next.js or Pages packaging does not grant permission to redesign it as part of COMPASS. A link to a project is not ownership of that destination's design.

COMPASS brand changes should use route CSS Modules or selectors scoped to the official components. Founder Japanese currently shares the `(official)` layout, so changing that layout's global CSS can cross the boundary even when no Founder file is edited. Check the import graph and rendered independent pages before release. Do not edit analytics, canonical hosts, redirects, authentication or routing to enforce a visual redesign.

The developer route currently exists in source. This document does not remove or publish any route. Removal, retirement or repository separation requires its own explicit instruction. The immediate boundary is an enforceable working rule in `AGENTS.md`, supported by separate route groups and scoped styles; it is not a claim of filesystem ACL isolation.
