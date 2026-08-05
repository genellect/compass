# Future Strategy Library API

Phase 5 persistence, Phase 6A Google identity, and Phase 7 reliable Drive
permission worker foundation.

## Safety boundary

- Use synthetic registration data only until Phase 6B passes.
- Phase 5 authentication facts remain mock input. Phase 6 routes derive them
  from a server-verified Google ID token and reject client-supplied facts.
- Drive is never called unless the worker API, external side effects, and Drive
  API flags are all enabled and the independent kill switch is off.
- Gmail API is not used. New permissions request Google Drive's standard
  notification email.
- Keep `EXTERNAL_SIDE_EFFECTS_ENABLED=false`, `PHASE7_DRIVE_API_ENABLED=false`,
  and `PHASE7_DRIVE_KILL_SWITCH=true` outside an approved empty-folder E2E.
- Do not commit `.env`, database URLs, tokens, or local database files.

## Local setup

```powershell
$env:UV_CACHE_DIR='C:\path\inside\workspace\uv-cache'
uv sync
Copy-Item .env.example .env
```

For a local SQLite smoke test, change both database URLs in `.env`:

```text
DATABASE_URL=sqlite+pysqlite:///./phase5-local.db
DATABASE_URL_UNPOOLED=sqlite+pysqlite:///./phase5-local.db
```

Apply migrations and run:

```powershell
uv run python -m alembic upgrade head
uv run python -m pytest
uv run python -m uvicorn app.main:app --reload
```

On this Windows machine, the workspace-managed Python `_sqlite3` module is
blocked by application control. Tests were therefore run in the untracked
`.venv-trusted` environment created from the signed Codex bundled Python.
This is a machine-specific test workaround, not a production dependency.

## Isolated Docker setup

Run Docker only through the repository wrapper. It fixes the Compose project,
network, volume, ownership labels, and localhost ports, and aborts if those
resources overlap or are owned by another project.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-docker-dev.ps1 -Action Down
```

Run these commands from the repository root. The isolated API is
`http://127.0.0.1:58000` and local PostgreSQL 17 is bound to
`127.0.0.1:55432`. The wrapper never stops, deletes, or reuses any
`COMPASS Interactive` Docker resource. If a conflict is detected, the
registration stack stops its own operation.

## Neon connection split

- `DATABASE_URL`: pooled endpoint for FastAPI.
- `DATABASE_URL_UNPOOLED`: direct endpoint for Alembic and backup/restore.

Do not run Alembic through the pooled endpoint.
Neon PgBouncer rejects `statement_timeout` in startup `options`, so the
application omits that startup option for pooled URLs. Direct connections keep
the configured startup timeout.

After applying migrations to the synthetic Neon project through the direct
endpoint, verify the runtime schema through the pooled endpoint without
printing either connection string:

```powershell
python -m alembic upgrade head
python -m scripts.verify_phase7_neon
```

The verifier is read-only, requires the Phase 7 head revision, checks pooled
runtime/direct migration separation, and refuses to run unless Drive side
effects remain disabled and the kill switch remains active.

## Local endpoints

- `GET /health`
- `POST /phase3/evaluate`
- `GET /phase5/health/db`
- `POST /phase5/registrations`
- `POST /phase6/auth/verify`
- `POST /phase6/registrations`
- `GET /phase6/admin/authorization`
- `GET /phase7/registrations/{application_id}/status`
- `POST /phase7/internal/operations/process`
- `POST /phase7/internal/operations/{operation_id}/retry`
- `POST /phase7/internal/members/{member_id}/revoke`

`POST /phase5/registrations` requires an `Idempotency-Key` header. It
recomputes existing-registration state from the database and ignores the
client-supplied `existingRegistration` value for persistence decisions.

Phase 6 routes are disabled by default. For a bounded local E2E, set these
values only in local environment variables or ignored env files:

```text
PHASE6_AUTH_API_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=<public Web OAuth client ID>
ALLOWED_GOOGLE_HOSTED_DOMAINS=st.kitasato-u.ac.jp
CORS_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
```

The client ID is public configuration. A client secret is not used for Google
Identity Services ID-token verification. Never store an ID token in an env
file, database, Git, browser storage, URL, or test evidence. Phase 6 requests
send the short-lived ID token as `Authorization: Bearer ...`; the API stores
only the Google `sub` identity link and a SHA-256 subject hash for idempotency
ownership.

The allowed `hd` check is only the first organization gate. It does not infer
faculty, grade, student number, or student/staff status. Drive eligibility
continues to use the fixed form rules. Phase 7 does not change this contract.

## Phase 7 Drive worker

Approved registrations commit a `pending` access grant and outbox operation in
the same database transaction. The request returns pending; it never reports
Drive success before the worker confirms it. The worker:

- claims due operations with an expiring lease;
- ignores database target IDs and uses only its worker-only fixed Drive target;
- accepts only a fresh versioned HMAC-SHA256 attestation that binds the
  operation, member, application, normalized email, reader role, type,
  issuance time, and one-time nonce;
- fails missing, modified, expired, target-mismatched, or replayed
  attestations before any Drive API call;
- serializes permission mutations for the fixed Drive target;
- preserves existing reader/commenter/writer permissions as system-unmanaged;
- requests a new `reader` permission and standard Drive notification once;
- stores the returned permission ID, role, timestamps, and notification state;
- retries retryable failures finitely, then moves them to `dead`;
- exposes a protected manual requeue route;
- deletes only permissions whose successful create response was recorded by
  this system and whose live Drive permission still matches the attested
  recipient.

Public and admin producer services receive the dedicated 256-bit-or-stronger
attestation key, but no Drive resource ID or Drive OAuth credential. The worker
receives the same pinned key version; only an explicitly activated worker
revision receives the real Drive target and OAuth credentials. The attestation
key must never be reused as an edge, worker-auth, database, or OAuth secret.
Manual retry always creates a fresh nonce and signature. Operations created
before the attestation migration fail closed and require explicit operator
review and retry; the migration does not invent authorization evidence.

Local shared-secret mode requires a 32+ character worker secret and the Phase 7
boundary validation. Production uses Cloud Run IAM/OIDC instead of that custom
header. OAuth client secret and refresh token stay in Secret Manager, never in
`NEXT_PUBLIC`, Git, the database, logs, or evidence files.

The production worker configuration is intentionally fail-closed:

```text
EXTERNAL_SIDE_EFFECTS_ENABLED=false
PHASE7_WORKER_API_ENABLED=false
PHASE7_DRIVE_API_ENABLED=false
PHASE7_DRIVE_KILL_SWITCH=true
PHASE7_DRIVE_ACTIVATION_CONFIRMATION=
```

This standby state is a healthy Cloud Run revision: liveness remains available,
but the processing route is not enabled and no Drive credential is required.
Terraform does not create the Scheduler invocation/IAM bindings or give the
worker access to Drive secrets while standby is selected. Activation requires
all four flags to move together and the exact reviewed confirmation
`I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1`. A partial flag change is rejected
at startup. Returning to the standby flags does not require that confirmation,
so emergency stop remains possible.

## Phase 7 real Drive E2E

The owner OAuth design uses the `drive` scope because granting a permission on
an established folder propagates to its existing children. The narrower
`drive.file` scope can authorize the selected folder while Google still rejects
that propagation with `appNotAuthorizedToChild`. The worker remains pinned to
the human-approved production folder ID and runs with private IAM, but the OAuth
scope itself is restricted and must be handled as a production credential.
Configure a Web OAuth
redirect `http://localhost:8767/oauth2/callback`, enable Drive and Picker APIs,
and use a referrer/API-restricted Picker key. Then run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase7-drive-e2e.ps1
```

The wrapper prompts locally for the Web Client ID/Secret, restricted Picker
key, project number, and test recipient. Select only a newly created empty test
folder. The helper runs the real Phase 7 grant worker, proves a second worker
run creates nothing, pauses for recipient Viewer/notification confirmation,
runs the real revoke worker, revokes the OAuth grant, and writes only sanitized
fingerprints. It never targets the production folder automatically.

For the manual local Google E2E, first add
`http://127.0.0.1:3000` to the Web OAuth client's Authorized JavaScript
origins. You may store the public Client ID as Windows User
`GOOGLE_OAUTH_CLIENT_ID`; if it is absent, the wrapper prompts for it without
persisting it. Then run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase6a-local-e2e.ps1
```

The wrapper forwards the public Client ID in process memory, enables Phase 6
only for the isolated local stack, forces external side effects off, runs the
frontend in the foreground, and stops only the registration containers on
exit.
For the first manual run, stop after account verification and do not submit the
registration form. `/phase6/auth/verify` does not persist the verified email or
`sub`; a registration submission would persist them in the dedicated local
PostgreSQL volume and therefore requires a separate retention/deletion check.

## Historical Phase 4 OIDC evidence helper

The Phase 4 pair/succession helper is retained only as historical evidence and
is not a current PASS or Production Gate procedure. The current administrator
contract does not require a second human administrator. Its initial allowlist
contains only two Google accounts controlled by the same owner (one Workspace
account and one Gmail account), with both verified subjects bootstrapped as
`admin`. Future additions require explicit owner approval, a private Secret
Manager change, an audit record, verified token claims, and subject bootstrap.

The exact email values belong only in the private Production
`GOOGLE_ADMIN_ALLOWED_EMAILS` runtime setting/Secret Manager. Never place those
values, Google subjects, tokens, or recovery material in this public repository,
build output, logs, screenshots, or chat. Follow
`docs/library-registration/admin-access-security-boundary.md` and
`docs/library-registration/phase8b-admin-operations-runbook.md` for the current
deny-by-default gate.

Production administrator requests must enter through the same-origin Cloudflare
Pages Function at `/library-registration/admin/api`. The Function accepts only
the reviewed path/method/query/header contract, injects
`X-Library-Admin-Edge-Secret`, and never forwards browser cookies, arbitrary
forwarded headers, redirects, `Set-Cookie`, or CORS headers. Configure the exact
dedicated admin Cloud Run HTTPS origin (Terraform `admin_api_url`) as the private
Pages variable `LIBRARY_ADMIN_API_ORIGIN`. Never point it to the public registration
service. The public entrypoint does not mount `/phase6/admin/authorization` or
`/admin/v1/*`; those routes exist only in `app.admin_main:app`.
Store the same random 32--512 character value as the Pages encrypted secret and
the pinned GCP Secret Manager value `LIBRARY_ADMIN_EDGE_SHARED_SECRET`; never use
a `NEXT_PUBLIC_*` variable for it.

In Production, the API checks the edge secret before the per-process pre-auth
limit and Google verification. Missing, mismatched, or duplicate edge headers
return the same no-store 404 response. `ADMIN_PREAUTH_RATE_LIMIT_PER_MINUTE`
defaults to 30 and is safe only while the reviewed Terraform maximum instance
count remains one. Scaling requires a shared limiter or an edge-enforced limit
first. These controls complement rather than replace Cloudflare Access, the
exact administrator email allowlist, Google token validation, and database
`sub` RBAC.

Production uses four isolated image targets: `public`, `admin`, `worker`, and
`migration`. The three runtime services receive separate service accounts and
separate database logins. The public role cannot read `library_admins`,
`library_admin_audit`, or `library_export_runs`; the admin role has only the
member/application/grant/operation read-update capabilities and append-only
administrator audit/export capabilities required by the reviewed routes. Only
the migration job receives a direct database URL.
