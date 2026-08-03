# Future Strategy Library production platform

This directory is a reviewable deployment definition. It has not been applied
to Google Cloud, Neon, Google Drive, or Cloudflare.

## Capability split

| Image target | Entrypoint | Pooled DB | Direct DB | Drive secrets | Ingress |
|---|---|---:|---:|---:|---|
| `public` | `app.public_main:app` | yes | no | no | public only after separate ingress activation; application OAuth required |
| `admin` | `app.admin_main:app` | yes | no | no | public invocation only after admin activation; Pages edge secret + administrator OAuth + DB RBAC required |
| `worker` | `app.worker_main:app` | yes | no | activation時だけ | internal; activation時だけexact Scheduler SA via IAM/OIDC |
| `migration` | `scripts.run_migrations` | no | yes | no | one-shot Cloud Run Job only |

The production admin service exposes only `/health/live` without its private
edge capability. Startup and liveness probes use that path. `/health/ready`,
known administrator routes, and unknown paths all require the edge secret and
pass the pre-auth limiter before route resolution or database access.
Cloudflare Access assertions are not backend authorization credentials.

The public, admin, and worker images do not contain Alembic migrations. The migration
image has no public server command. The worker has no `allUsers` binding, and
its scheduler request uses a Google-signed OIDC token with one stable custom
Cloud Run audience. No custom secret header is placed in Cloud Scheduler
configuration or Terraform state.

The reviewed Terraform defaults are fail-closed. A first full apply uses
`runtime_services_activation.enabled=false`: it creates the migration job and
its minimum secret binding, but no public/admin/worker Cloud Run service, public
invoker, Scheduler, runtime secret binding, or runtime alert. This prevents
startup probes from racing a fresh database before Alembic has run. After the
migration job and database role audit pass, the second reviewed full plan may
set the exact `I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1`
confirmation. Do not use `terraform -target` as the bootstrap workflow.

`cost_guardrails_review`, `public_ingress_activation`,
`worker_drive_activation`, `admin_api_activation`,
`public_api_write_activation`, and `phase10a_export_activation` also default to
`enabled=false` with empty confirmations. The public API is therefore created
without an `allUsers` invoker and in read-only mode, the dedicated admin service
is absent, export is absent, and the public surface always omits
`/phase6/admin/authorization` and `/admin/v1/*`,
and Drive processing/Scheduler/Drive-secret bindings remain absent. Every
unsafe direction has its own exact confirmation string in `variables.tf`.
Returning `public_api_write_activation` to disabled is the emergency read-only
switch and deliberately needs no confirmation; restoring writes does. Returning
`public_ingress_activation` to disabled removes the public invoker without
destroying the runtime and is the first public-compute cost-stop action.

Runtime creation additionally requires a human-reviewed Cloud Run spend-cap
budget, a separate project alerts-only budget, and at least one notification
channel. Terraform records the reviewed dollar amounts and exact confirmation;
it does not create or discover either Billing budget. `cost_guardrails_review`
is an operator attestation, not a managed billing resource. The Cloud Run spend
cap is a Google Cloud Preview feature whose enforcement is not instantaneous;
it also does not stop non-Cloud-Run fixed costs. A plan must remain blocked until
separate console evidence confirms both budgets in the dedicated project.

## Review-only workflow

From `infra/library-registration/terraform`:

```powershell
terraform fmt -check
terraform init -backend=false
terraform validate
terraform plan -var-file=terraform.tfvars
```

Copy `terraform.registration-preview.tfvars.example` for a registration-only
Preview, or `terraform.tfvars.example` for the full platform, to the ignored
`terraform.tfvars`. It contains
resource names, immutable image digests, numeric Secret Manager versions, the
public OAuth client ID, any separately activated admin OAuth client ID, and the
exact frontend origin; it must not contain a password, token, refresh token,
database URL, or OAuth client secret.

Production uses the checked-in empty `backend "gcs" {}` contract. Supply the
existing restricted bucket and prefix only at initialization, for example
`terraform init -backend-config="bucket=..." -backend-config="prefix=fsl/production"`.
Never commit backend coordinates or credentials. Before any `terraform apply`,
the operator must obtain explicit implementation approval. `apply`, image push,
service enablement, IAM mutation, secret creation, OAuth consent, and production
database changes are human gates.

The read-only `scripts/gcp-readonly-preflight.ps1` checks active authentication,
project/billing, the approved region, required APIs, a restricted state bucket,
the Docker repository, the reviewed Secret Manager container IDs, immutable
image digests, and configured notification channels. Required
APIs include both Drive and Google Picker only when the Drive capability is in
scope for owner-OAuth bootstrap. The preflight never accesses secret versions
or payloads and emits fingerprinted,
sanitized JSON evidence. Use `-DeploymentProfile registration-preview` for the
three-image, five-secret registration-only standby inventory. Add
`-IncludeDrive` only when the four Drive secrets and Drive APIs have been
prepared; this raises the Preview inventory to nine. The default
`full-production` profile continues to require all four images and twelve
secrets.

## Ordered bootstrap (full plans only)

1. Run the read-only GCP preflight and review its sanitized PASS evidence.
2. Initialize the GCS backend and review a full plan with runtime and all
   capabilities disabled.
3. Apply that full migration-only plan after human approval.
4. Execute the migration job once; verify Alembic head and the database role
   audit. A created job is not evidence that it ran.
5. Configure and review the Cloud Run spend cap, project alerts-only budget,
   and notification channel. Record matching values in `cost_guardrails_review`.
6. Enable `runtime_services_activation` with its exact confirmation, while
   keeping public ingress/Drive/admin/export/writes disabled. Review and apply
   the second full plan; the public and worker services start fail-closed and
   the public API is unreachable and read-only. The admin service is still absent.
7. Enable public ingress, then public writes, admin, Drive, and export only through their separate
   reviewed plans and gates.

`runtime_services_activation` is a bootstrap latch, not an incident switch.
After services exist, keep it enabled; `prevent_destroy` intentionally rejects
using it to tear down runtime services. Use public ingress removal, API
read-only, and Drive kill-switch controls for incidents. The Drive scheduler
runs every 15 minutes, processes at most 20 operations, and has no automatic
retry so idle polling does not intentionally keep Neon continuously awake.

## Required existing secrets

The registration-only standby inventory is five active versions: public,
worker, and migration database capabilities, the public-registration RPC token,
and the Drive-operation attestation key. Enabling real Drive processing adds
four worker-only versions, for nine total. Enabling the administrator service
later adds three administrator-only versions, for the full steady-state total
of twelve. Inactive admin and Drive IDs/versions remain empty and Terraform does
not create their service bindings or the administrator service account. If the
billing account's six-version free allowance is otherwise unused, the nine-
version Drive Preview is approximately USD 0.18/month and the twelve-version
full platform approximately USD 0.36/month. Rotation temporarily adds one paid
version; disable the old version only after the replacement revision is
verified.

- Public API pooled runtime URL, using a login bound only to `fsl_api_runtime`.
- Admin API pooled runtime URL, using a third login bound only to
  `fsl_admin_runtime`. The public login has no access to administrator,
  audit, or export tables.
- Worker pooled runtime URL, using a separate login bound only to
  `fsl_worker_runtime`.
- Migration direct URL, using the login bound to `fsl_migration`. The standing
  `fsl_backup_restore` login is read-only and is used for backup inspection and
  `pg_dump`, never for `pg_restore`. Restore into an explicitly empty synthetic
  branch uses that branch's owner or a separately approved temporary restore
  login; neither credential is bound to a runtime service.
- Exact administrator email allowlist. Its payload contains the initial
  owner-controlled accounts and is bound only to the dedicated admin runtime.
- Admin edge shared secret. The same random 32--512 character value is stored
  as a Cloudflare Pages encrypted secret and as a pinned Secret Manager version;
  it is never a public build variable. The admin API runtime uses it to reject
  direct-origin admin requests before Google verification.
- Public-registration RPC token. The public service receives the raw value;
  PostgreSQL stores only its SHA-256 digest in `fsl_private`. It must be
  independent of every database, OAuth, Drive, worker, and edge credential.
- Drive-operation attestation key. It is a dedicated value shared only by the
  producer surfaces and worker; it must not equal any edge, worker, or OAuth
  secret. The real Drive resource ID remains worker-only.
- Drive OAuth client ID, client secret, owner refresh token, and approved Drive
  resource ID. These are bound only to the worker service account and only when
  the reviewed `worker_drive_activation` contract is enabled.

Every service revision pins a numeric secret version. `latest` is rejected by
the variable contract. Rotation therefore produces a reviewable revision and
permits deliberate disabling of the previous version after validation.

The database backup excludes
`fsl_private.public_registration_rpc_keys` table data. A restore is not
accepted until ownership and ACL scripts have been reapplied, the current RPC
digest has been reprovisioned from environment-only secret material, and the
role audit passes. Rotate by provisioning a new key version, deploying and
checking the new public revision, then setting
`PUBLIC_REGISTRATION_RPC_RETIRE_VERSION` and the exact confirmation
`retire-<old>-after-<new>-ready`; rollback keeps the old version active until
the new revision has passed readiness.

Set the Cloudflare Pages Production variable `LIBRARY_ADMIN_CANONICAL_ORIGIN`
to the exact canonical site origin. Set encrypted `LIBRARY_ADMIN_API_ORIGIN`
to the exact Terraform `admin_api_url` output. Never point the administrator
proxy to the public service URL. Do not configure the administrator API origin
or edge secret in the Preview environment; the Function also rejects every
request whose origin differs from the canonical origin.

See `docs/library-registration/phase8a-production-platform-runbook.md` for the
ordered gate, recovery, backup/restore, monitoring, and rotation procedure.
