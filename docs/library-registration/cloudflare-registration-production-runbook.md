# Cloudflare registration-only Production Runbook

Status: approved release path; execution requires an exact reviewed `origin/main` commit

This workflow publishes the Future Strategy Library registration UI to the existing
`compass-official` Cloudflare Pages production branch. It does not publish the Library
administrator UI or administrator Pages proxy.

## Fixed release boundary

- Git branch and Cloudflare production branch: `main`
- Canonical frontend: `https://compass-official.pages.dev`
- Public registration API: `https://fsl-registration-public-eq64wn4f4a-as.a.run.app`
- `LIBRARY_RELEASE_TARGET=production`
- `LIBRARY_RELEASE_SCOPE=registration_only`
- registration mode: `google`
- administrator mode: `mock`, then removed from the staged artifact
- retained Pages Functions: `/api/community-registration` and `/api/contact` only
- removed surfaces: administrator static UI, administrator Function, administrator route,
  administrator/synthetic artifact markers

The existing Community and Contact Cloudflare secrets remain project-side. The workflow
does not read or print their values. The registration Google OAuth client ID must already
be present in the operator's local environment; it is a public OAuth audience identifier,
not a client secret.

## Pre-deployment gates

1. Merge the reviewed change to `origin/main` and obtain its 40-character commit SHA.
2. Confirm the local worktree is clean and checked out at that exact `origin/main` SHA.
3. Confirm Cloudflare Wrangler is authenticated to the account containing exactly one
   `compass-official` project whose production deployments identify `main` as the branch.
4. Update the public API CORS allowlist so an OPTIONS request from
   `https://compass-official.pages.dev` is accepted. The wrapper checks this twice and
   refuses publication if the canonical origin is not returned exactly.
5. Keep all administrator frontend variables unset.

## Command

Run in PowerShell without placing credentials in shell history:

```powershell
$env:LIBRARY_RELEASE_REVIEWED_COMMIT='<reviewed-origin-main-sha>'
$env:LIBRARY_RELEASE_CONFIRMATION='I_APPROVED_LIBRARY_REGISTRATION_ONLY_PRODUCTION_V1'
npm.cmd run deploy:cloudflare:library-production -- -SkipPreviouslyPassedChecks
```

Omit `-SkipPreviouslyPassedChecks` when the exact commit has not already passed its test
and typecheck jobs. Even with the switch, the workflow always builds, runs the ordinary
static verifier, creates an isolated artifact, verifies it twice, refreshes `origin/main`,
rechecks Cloudflare project/branch metadata, rechecks canonical CORS, and only then deploys
with `--branch main` and `--commit-dirty=false`.

## Rollback

Use the Cloudflare Pages production deployment history to roll back to the immediately
preceding reviewed production deployment. Do not re-enable the legacy form by editing the
staged artifact. A source-level emergency rollback may set `NEXT_PUBLIC_FSL_REGISTRATION_URL`
to the canonical legacy Google Form in a separately reviewed commit; the registration-only
production wrapper deliberately rejects that override so cutover and rollback remain
distinct, reviewable actions.
