# Preview Neon login provisioning

Status: local implementation; live Neon execution requires the operator's explicit run
Scope: registration-only Production-shaped Preview

This helper creates only the fixed Preview LOGIN principals required by the public API,
worker, migration job, and backup/restore path. The administrator LOGIN is opt-in and
must remain absent from a registration-only Preview. It does not bind capability roles,
run Alembic, upload a secret, or deploy a service.

## Fixed principals

| Surface | Fixed LOGIN | Intended connection |
|---|---|---|
| Public API | `fsl_preview_api_login` | pooled |
| Worker | `fsl_preview_worker_login` | pooled |
| Migration | `fsl_preview_migration_login` | direct |
| Backup/restore | `fsl_preview_backup_restore_login` | direct |
| Admin, optional only | `fsl_preview_admin_login` | pooled |

Each principal receives an independent 384-bit random password and is created with
`LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.
The script rejects an existing fixed principal if it is an owner, is over-privileged,
or has membership beyond its one intended NOLOGIN capability role.

## Prerequisites and URL boundary

- Run on Windows as the host user who will retain the DPAPI bundle.
- Prefer a native PostgreSQL 17 `psql`. If it is absent, the script uses the isolated
  `postgres:17-bookworm` client through Docker Desktop.
- Copy the **direct** Neon database-owner URL. A `-pooler` host is refused.
- The URL must contain exactly `sslmode=require&channel_binding=require`. The client
  also sets `PGSSLMODE=require` and `PGCHANNELBINDING=require`, so a connection that
  cannot negotiate channel binding fails.
- The server preflight requires the connected role to be the exact current database
  owner, to have `CREATEROLE`, and not to be a superuser.

The URL is accepted only through the current process environment. To keep it out of
PowerShell history and terminal output, use a masked prompt:

```powershell
$ownerUrl = Read-Host 'Paste the direct Neon owner URL' -AsSecureString
$ownerUrlPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ownerUrl)
try {
  $env:FSL_PREVIEW_DATABASE_OWNER_URL = `
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ownerUrlPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ownerUrlPointer)
  $ownerUrl = $null
}
$env:FSL_PREVIEW_DATABASE_PROVISION_CONFIRM = `
  'provision-fixed-preview-login-roles'
```

## Exact invocation

Use an operator-controlled directory outside every Git worktree when possible. An
in-repository directory is accepted only when `git check-ignore` proves that it is
ignored. `outputs/` is ignored, but it is an ephemeral build area, so an external
private evidence directory is safer.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  services/library-api/scripts/provision_preview_database_logins.ps1 `
  -OutputDirectory 'C:\private-evidence\fsl-preview-database'
```

Do not pass `-IncludeAdmin` for the registration-only Preview. If an independently
approved private administrator service is provisioned in a later environment, the
initial invocation for that fresh environment may add `-IncludeAdmin`.

The only successful console output is a pass marker, role count, SHA-256 fingerprints,
the protected bundle file name, and `credentials_printed=false`. No database URL or
password is printed.

## Protected outputs and replay behavior

- `fsl-preview-database-credentials.dpapi` contains the derived direct and pooled URLs.
  It is encrypted with Windows DPAPI `CurrentUser` scope and its ACL is replaced with
  a current-user-only rule.
- `fsl-preview-database-credential-fingerprints.json` contains only role names, state,
  endpoint and ciphertext fingerprints. It contains no URL, user password, or owner
  credential.

The DPAPI bundle is written in `pending` state before the single PostgreSQL transaction.
If the network outcome is ambiguous after commit, running the same command again as the
same Windows user with the same output directory, endpoint, and role set reuses the same
passwords and converges. If a fixed role exists without the matching DPAPI bundle, the
script fails rather than resetting or taking over that role.

After completion, clear the two process values:

```powershell
Remove-Item Env:FSL_PREVIEW_DATABASE_OWNER_URL -ErrorAction SilentlyContinue
Remove-Item Env:FSL_PREVIEW_DATABASE_PROVISION_CONFIRM -ErrorAction SilentlyContinue
```

## Required next gate

This operation creates LOGIN principals only. Continue with the existing reviewed
sequence: capability-role bootstrap, fixed LOGIN binding, Alembic migration through the
migration direct URL, grants, and owner-side audit. PostgreSQL 17 may auto-grant the
creating CREATEROLE principal `ADMIN TRUE, SET FALSE` membership in `fsl_migration`;
the bootstrap preserves that ADMIN grant and enables only `SET TRUE`, which is required
for schema ownership transfer. Bind the four non-admin LOGINs with
`database_roles.ps1 -Action Bind -RegistrationOnly`; this mode fails if an administrator
LOGIN is present.

## Security caveats

- DPAPI `CurrentUser` protection is deliberately not portable. Copying the file to a
  different Windows profile is not a recovery strategy. Transfer its values to the
  approved secret manager before the Windows profile is retired; otherwise a reviewed
  role-password rotation is required.
- A local machine administrator can inspect process memory. When Docker fallback is
  used, the short-lived container environment is also visible to the local Docker
  daemon administrator. Prefer native `psql`, close unrelated privileged tools, and
  clear the owner URL immediately afterward.
- DPAPI protects data at rest, not a compromised signed-in Windows session.
- Do not delete the bundle merely to retry. The missing-bundle/existing-role condition
  intentionally fails closed.
- The helper never provisions production users, reads registration PII, touches the
  COMPASS Interactive project, or changes Terraform/Cloudflare/GCP state.
