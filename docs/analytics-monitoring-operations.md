# COMPASS static-site analytics operations

Status: Operational Runbook
Scope: `compass-official.pages.dev`と`yuto-matsui.com`を配信する公開Pages project
Last source verification: 2026-08-28
External configuration: Operator verification required
Owner: COMPASS representative / designated operator
Data classification: Public-safe procedure; no secret values

This runbook covers visitor analytics for the shared `compass-official` Pages project, including
`compass-official.pages.dev` and the Founder canonical host `yuto-matsui.com`. It does not cover the
separate `compass-interactive.pages.dev` product.

## Data boundaries

- Keep the existing GA4 tags active.
- Measure page visits and aggregate engagement only.
- Do not send names, email addresses, student IDs, lecture codes, form contents, or other free text to analytics providers.
- Treat the Google Analytics property mapping and Cloudflare site token as deployment configuration. Never commit Google service-account credentials, Cloudflare API tokens, or account recovery material.

## GA4 collection scope

All deployed routes in the static Pages project use the parent-site measurement ID:

- Parent-site measurement ID: `G-EHKJ8B8N0Y`
- Included: the home page, Future Strategy Library, Manifesto, Interactive introduction, Community join, Contact, developer introduction, and `https://yuto-matsui.com/`.
- Excluded: the separate `compass-interactive.pages.dev` product.

The old Future Strategy Library and Interactive-introduction GA4 properties may be retained for historical reporting, but their measurement IDs must not be emitted by the deployed static-site routes after this release. Do not delete the old properties as part of this setup.

### Cross-domain configuration

Use the existing `COMPASS Official Website` property and existing Web data stream. Do not create a
second Founder property or measurement ID.

1. Open the Web data stream for measurement ID `G-EHKJ8B8N0Y`.
2. Under tag settings, open cross-domain configuration.
3. Keep `compass-official.pages.dev` and add `yuto-matsui.com` as exact domain matches.
4. Verify navigation between the two hosts decorates the destination with `_gl` where applicable and
   that GA4 records the new hostname in the same property without generating self-referrals.
5. Do not add `compass-interactive.pages.dev`; it is a separate deployment and analytics boundary.

## Looker Studio connection

1. Sign in to Looker Studio with the Google account that can read the intended GA4 property.
2. Create a reusable data source using the native Google Analytics connector.
3. Select the parent-site GA4 account and property. Use Owner's credentials unless organization policy requires viewer credentials.
4. Create a private report. Do not enable public-link access.
5. Add controls for date range, device category, and session channel group.
6. Add scorecards for Active users, New users, Views, Sessions, User engagement, and Engagement rate. The current GA4 connector does not expose an exact `Average engagement time per session` field, so do not substitute a similarly named metric without validating its definition.
7. Add a time-series chart for Views and New users, plus a page-path table sorted by Views in descending order.
8. Keep the connector's default data freshness unless a verified operational need justifies more frequent refreshes.
9. Record the data-source owner, report owner, GA4 property ID, and last verification date in the operator-only release record.

## Cloudflare Web Analytics

Use the Pages one-click integration rather than committing a site token to source:

1. In Cloudflare, open Workers & Pages.
2. Select the `compass-official` Pages project.
3. Open Metrics and enable Web Analytics.
4. Keep automatic snippet injection enabled for the whole Pages project.
5. Trigger a new production deployment; Cloudflare injects the beacon on the next deployment.
6. Verify that the rendered HTML contains `https://static.cloudflareinsights.com/beacon.min.js` and a `data-cf-beacon` attribute.
7. Visit the home page, Future Strategy Library, Manifesto, Interactive introduction, Community join, and Contact once each without submitting any form.
8. Confirm that the browser sends `POST /cdn-cgi/rum` and that no Content Security Policy error is logged.
9. Confirm that the Cloudflare dashboard begins reporting both `compass-official.pages.dev` and
   `yuto-matsui.com` under the same Pages project.

Community join and Contact use route-specific Content Security Policy headers. They explicitly allow the Cloudflare beacon origin; the build verifier prevents that allowance from being removed accidentally.

## Release verification

- Run `npm.cmd run check`.
- Confirm the existing GA4 scripts are still present on the official and Interactive introduction layouts.
- Confirm the Founder root emits the same `G-EHKJ8B8N0Y` tag and no additional measurement ID.
- Confirm no Cloudflare site token or account credential was committed.
- Verify the production HTML and `POST /cdn-cgi/rum` after Cloudflare Web Analytics is enabled and a deployment completes.
- Compare GA4 and Cloudflare totals as separate measurement systems; do not expect exact equality.
