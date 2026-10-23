# Future Strategy Library Next.js migration requirements

Status: Completed
Completed: 2026-07-31
Implementation commit: `0400155`
Current authority: route source, `PROJECT_GUIDE.md`, and `docs/CONTENT_GOVERNANCE.md`

This document records the requirements used for the completed migration from the retired standalone page to the native Next.js static-export route. It is retained for implementation history and must not override later copy, architecture, or production decisions.

## 1. Objective

Replace the standalone HTML implementation at `/future-strategy-library/` with a native Next.js static-export route on the existing COMPASS domain.

The page has one conversion goal:

> A Kitasato University pharmacy student understands the value and conditions of the library, then registers through the approved Google Form.

The production URL, registration destination, core educational identity, and trust requirements must remain unchanged.

## 2. Approved information architecture

The route contains eight primary sections:

1. Hero: preserve the approved responsive Hero and registration CTA.
2. Future Strategy Library statement: connect immediate exam needs to decisions after graduation.
3. Library in Numbers: use the supplied `数字で見る、未来戦略ライブラリ` copy and strongly present `2024.02`, `73+`, and `100+`; animate the two numeric totals when they enter the viewport.
4. What You Get: four editorial field cards for Pharmacy, English, AI Literacy, and Research & Career.
5. Featured Materials: three representative resources, each with a `資料を見る` action.
6. For You: four audience-fit statements and a closing invitation.
7. Access and Trust: audience, cost, university-account requirement, use conditions, operator status, and official-information reminder.
8. Start Here: close with the supplied registration invitation and wording.

The page must not restore the retired standalone navigation, status-section UI, project timeline, four-step registration guide, long rules grid, collaboration pitch, Design Philosophy links, or Essay reader. Only the three approved statistics may be reused in the new Library in Numbers composition.

## 3. CTA contract

- Primary label: `大学アカウントで無料登録する`
- Destination: the existing Future Strategy Library Google Form.
- The CTA may repeat in the global header, Hero, final section, and route-aware footer.
- Do not use a persistent Mobile CTA when the Hero action is already inside the first viewport; it must not cover reading content or duplicate the final action in one viewport.
- The supplied three `資料を見る` actions all open the same approved registration-form URL in a new tab; no direct material URL is exposed.
- No page-body action may use a destination other than the approved registration form.
- The external Google Form opens in a new tab. Same-domain COMPASS links stay in the current tab.

## 4. Content and brand requirements

- Preserve the established expressions `知ることが、未来を変える。` and `未来の選択肢を広げる。`.
- Outside the Hero, preserve the user-supplied Japanese copy exactly; improve hierarchy, spacing, typography, and responsive composition without silent rewriting.
- Connect practical student needs to future decisions without prescribing a specific qualification, laboratory, career, or AI service.
- Reuse existing library imagery and resource covers, with optimized WebP assets where available.
- Do not expose a personal name or laboratory affiliation in any displayed cover image. The AI cover must use the sanitized asset with its bottom-right author and laboratory line removed; the unsafe source asset must not be exported.
- Use the COMPASS dark-navy, cyan, warm-gold, scientific-grid, horizon, and quiet-future visual language.
- Use a light editorial surface for material proof so the page does not become an uninterrupted dark card stack.
- At Mobile widths, preserve the retired page's approved Hero hierarchy: full-bleed future image, centered library label, two-line title, two-line audience statement, three need cards, and one full-width registration CTA. Hide the longer Hero explanation and Desktop Library Index from that viewport.
- At Desktop widths, retain the new split Hero with explanatory copy and the four-field Library Index.
- Keep essential content in static HTML. The count-up enhancement may use client-side state, but its final values must remain available through accessible labels and reduced-motion users must receive the final values immediately.

## 5. Trust and accessibility requirements

- State that the library is for Kitasato University pharmacy students.
- State that registration and use are free.
- State that a university account is required.
- State that unauthorized sharing and redistribution are prohibited.
- Remind users to verify examinations, course registration, and career information against official university sources.
- Maintain one `h1`, logical headings, descriptive image alt text, keyboard focus visibility, readable Japanese typography, and reduced-motion support.

## 6. Routing and build requirements

- Implement `src/app/(official)/future-strategy-library/page.tsx` with route-scoped CSS.
- Reuse the official `SiteHeader` and `SiteFooter` with a library route context.
- Keep canonical `/future-strategy-library/`, sitemap entry, and existing aliases/redirects.
- Remove the post-build copy of the legacy directory so it cannot overwrite the Next.js export.
- Remove the legacy HTML/CSS/inline-JavaScript implementation after reusable assets are relocated under `public/images/future-strategy-library/`.
- The official layout remains responsible for the COMPASS analytics tag; the retired library analytics tag must not remain.

## 7. Acceptance criteria

- `npm.cmd run check` passes.
- The static export contains `/future-strategy-library/index.html` as a Next.js route.
- The route contains the approved eight-section hierarchy and exactly one `h1`.
- The legacy stylesheets, inline page application, Essay, timeline, and old analytics ID are absent from the export.
- Desktop, tablet, and 390px Mobile show no horizontal overflow.
- At 390 x 844, the Mobile Hero registration CTA is fully visible in the first viewport and the title remains exactly two lines.
- Registration CTA destination and new-tab behavior are correct.
- All three `資料を見る` actions use the approved registration-form URL and open in a new tab.
- At 390px, the statement heading uses balanced, controlled breaks at natural Japanese phrase boundaries and remains visibly larger than body copy.
- The AI cover displayed and exported by the route contains no personal name or laboratory affiliation.
- Same-domain navigation does not open a new tab.
- Browser console contains no warnings or errors attributable to the route.
- The local preview is left running for review.
