# Contact gallery UI

The `/contact/` route uses independent Contact chrome. The existing compass mark
and favicon remain, the fixed header reads **Contact**, and the footer credits
**Yuto Matsui**. The shared COMPASS header/footer are not rendered on this route.

Desktop navigation contains the JP and EN Yuto Matsui portfolios, COMPASS Platform,
and the COMPASS Interactive introduction. At 900 CSS pixels and below, these four
links appear in a non-modal speech-bubble disclosure anchored to Menu. Escape
returns focus to Menu; outside clicks, keyboard departure, link selection, and a
transition to Desktop close the bubble. Page scrolling remains available.

The gallery skin changes form decoration, not copy, field geometry, selection,
validation, email verification, API payloads, or delivery. `ContactForm.tsx` and
all Contact backend sources are unchanged. The existing success-page return link
is also preserved. Other websites sharing this repository are outside this edit.

The Three.js scene is loaded separately after hydration. Geometry surrounds the
form and cannot intercept input. A 1.3-second entrance settles to a static pose;
fine pointers can then subtly change perspective. Rendering is event-driven,
stops offscreen/when hidden, and caps device pixel ratio. Reduced motion skips
the module, while unavailable WebGL leaves the CSS architectural backdrop.

## Non-live verification

`npm run test:responsive` and the full/cloud variants include
`tests/responsive/contact-gallery.spec.ts`. It verifies boundary widths,
keyboard/touch menus, form-state preservation, WebGL fallback, reduced motion,
and both destination flows through mocked verification/retry/success responses.
The responsive fixture blocks analytics and real form delivery. No production
email or verification code should be sent by these checks.

The Contact route deliberately opts out of the shared full-screen Mobile menu
contract. All other routes retain that contract. Preview publication uses the
existing Cloudflare Git branch build; production publication is a separate step.

## Atrium revision (2026-09-10)

The visible wordmark is CONTACT. An 880px maximum writing desk exposes the
monumental ring and receding colonnades above and beside the content. Mobile
reserves 152px below the fixed header for the architecture, with a shorter
entrance on short viewports. Solid white form panels retain readable text.
Scroll adds a small depth offset; input focus freezes pointer/scroll response.
The CSS fallback retains the ring and perspective floor without WebGL.
ContactForm, schema, Pages Functions, and GAS remain unchanged.
