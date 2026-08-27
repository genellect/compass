# Founder custom-domain operations

Status: Operational Runbook
Scope: `https://yuto-matsui.com/` and the former COMPASS Founder URL
Last source verification: 2026-08-28

## Canonical and hosting boundary

- Canonical Founder URL: `https://yuto-matsui.com/`
- Source and deployment owner: `genellect/compass` / Cloudflare Pages `compass-official`
- Internal static export retained at: `/founder/`
- GA4: existing `COMPASS Official Website` property and `G-EHKJ8B8N0Y`
- UI, copy, images, forms, APIs, authentication, and databases remain unchanged.

## Redirect contract

Keep the following permanent redirects without an expiry date. Preserve query strings.

- `https://compass-official.pages.dev/founder` → `https://yuto-matsui.com/`
- `https://compass-official.pages.dev/founder/` → `https://yuto-matsui.com/`
- `https://compass-official.pages.dev/founder/index.html` → `https://yuto-matsui.com/`
- `http://yuto-matsui.com/*` → the same path on `https://yuto-matsui.com/*`
- `http://www.yuto-matsui.com/*` and `https://www.yuto-matsui.com/*` → the same path on `https://yuto-matsui.com/*`
- Non-Founder HTML routes requested on the Founder host → the corresponding
  `https://compass-official.pages.dev/*` URL.

Do not redirect `/_next/*`, `/images/*`, `/cdn-cgi/*`, `/robots.txt`, or `/sitemap.xml` away from the
Founder host; the Founder page needs those assets and control files on its canonical host.

Fragments are browser-only and are not sent to the server. A URL such as the former
`/founder/#products` reaches `https://yuto-matsui.com/#products` because the 301 target is the new
root and the browser retains the fragment.

## Search engine cutover

1. Verify the root returns 200, is indexable, and emits the new canonical, Open Graph URL, and Person URL.
2. Verify `https://yuto-matsui.com/robots.txt` allows crawling and references the new sitemap.
3. Verify `https://yuto-matsui.com/sitemap.xml` contains only the canonical root.
4. Add a domain property for `yuto-matsui.com` in Google Search Console, submit the sitemap, inspect the
   root URL, and request indexing. Do not use Change of Address for this one-page move.
5. Add or import the site in Bing Webmaster Tools, submit the sitemap, inspect the root URL, and submit it
   for indexing.
6. Index submission is a crawl request, not a guarantee of appearance or ranking. Recheck coverage after
   7 and 30 days.

## Release verification

- Old URL variants return a single 301 to the canonical root.
- Query strings are retained and fragments land on the matching section.
- `www` and HTTP normalize to HTTPS apex.
- Parent-site and Interactive links point directly to the canonical root.
- Old COMPASS sitemap excludes Founder; the new sitemap contains exactly one URL.
- GA4 and Cloudflare Web Analytics record the new hostname without PII.
- Existing COMPASS routes, assets, APIs, forms, and authentication continue to behave as before.
