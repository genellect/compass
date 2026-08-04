# Local pre-Production-Gate Runbook

Status: Synthetic-only integrated gate<br>
Scope: Phase 8A/8B/9/10A local implementation<br>
Last verified: 2026-08-01

## 1. Purpose

`scripts/library-local-preproduction-gate.ps1` is the canonical local gate before any
Production Gate integration. It proves source integrity, frontend and backend regressions,
production-shaped and mock-restored frontend artifacts, production image buildability,
Terraform syntax, PostgreSQL migration/race/idempotency, 200-registration load, and
backup/restore using synthetic data only.

It does not prove Google OAuth, Drive permission changes, Neon, Cloud Run, Cloudflare,
real Excel acceptance, legal approval, human browser acceptance, or production readiness.

## 2. Safety boundary

- Refuses a path matching `COMPASS Interactive`.
- Uses only `compass-library-registration-dev` and `fsl-registration-*` Docker resources.
- The Compose runtime network is internal and cannot reach external services.
- API readiness is read from the container health state; the gate does not expose or
  probe the API through a host route that would weaken the internal-network boundary.
- Forces registration/admin mock mode, exact local CORS, OAuth/worker/admin/export OFF,
  Drive kill switch ON, synthetic classification, and a synthetic local DB password.
- Captures and restores inherited environment variables without printing their values.
- Requires a clean worktree before execution and sets Next telemetry disabled plus npm offline mode.
- Scans tracked and untracked source files for whitespace, merge markers, and known
  credential shapes. Findings report only file path and rule identifier, never the value.
- Records independent pre/post HEAD, source manifest, file count, dirty flag, and hashed
  worktree status. Any difference fails with `source_changed_during_gate`.
- Docker cleanup is part of PASS. A failed `Down` writes failure evidence and returns nonzero.
- `outputs/`, `.next`, `out`, `node_modules`, local Terraform cache, and ignored secret files
  are excluded from the source manifest.

Docker Hub and the Terraform provider registry may be read to obtain pinned local build
dependencies. The gate performs no Google/GCP/Neon API call, authentication, plan, apply,
deployment, publication, Drive mutation, or real-PII processing.

## 3. Commands

From repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-local-preproduction-gate.ps1 -Action Validate

powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\library-local-preproduction-gate.ps1 -Action Run
```

`Validate` checks Docker isolation plus the sanitized source manifest. `Run` additionally
executes:

1. frontend tests, TypeScript, mock build, deployment artifact verification, and release-gate tests;
2. a production-shaped `google`/admin build with reserved synthetic values, production
   artifact verification, and fail-closed restoration/verification of the final mock `out/`;
3. Python compile and full backend tests in the isolated Docker development image;
4. local builds of the `public`, `worker`, and `migration` production image targets;
5. Terraform `fmt -check -recursive`, `init -backend=false`, and `validate` with the checked-in lock;
6. Phase 9/10A PostgreSQL downgrade/re-upgrade, concurrent/idempotent apply, rollback,
   immutable snapshot/export checks, and export generation;
7. Phase 8A synthetic 200-registration/concurrency-2 load plus `pg_dump`/restore verification;
8. clean source integrity/provenance snapshots before execution and after all tests, with
   exact HEAD/manifest/status-fingerprint comparison; and
9. owned-container shutdown while preserving the registration development volume.

The frontend rehearsal remains independently runnable, but the canonical integrated gate
also invokes it. It temporarily creates google-mode static artifacts and must always restore
`out/` to explicit mock mode, even when the production-shaped build fails.

## 4. Evidence and interpretation

Default evidence:

```text
outputs/library-registration/local-preproduction-gate.json
```

The JSON contains only status, step results, timestamp, independent pre/post `HEAD`, SHA-256
over a sanitized source-file hash manifest, source count, hashed worktree status,
`source_integrity_unchanged`, `source_integrity_state`
(`unchanged` / `changed` / `check_failed` / `not_captured`), and safety booleans. The post
snapshot is captured after Docker cleanup and environment restoration even when an earlier
test step fails, whenever the pre snapshot was available.
It contains no source content, credential, PII, DB URL, Drive ID, or OAuth token.

PASS means:

```text
LOCAL PRE-PRODUCTION IMPLEMENTATION PASS
EXTERNAL AUTH / HUMAN / DATA-POLICY GATES PENDING
PRODUCTION BLOCKED
```

Do not change the public CTA, run Terraform plan/apply, deploy, or enable Drive/admin/export
side effects based only on this local PASS.
