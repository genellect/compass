import re
from pathlib import Path

import pytest

from scripts.run_migrations import _require_direct_url
from scripts.verify_phase8a_local_load import _guard_local_synthetic_url
from scripts.verify_synthetic_restore import _direct_url as restore_direct_url


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SERVICE_ROOT = REPOSITORY_ROOT / "services" / "library-api"
TERRAFORM_ROOT = REPOSITORY_ROOT / "infra" / "library-registration" / "terraform"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _docker_stage(dockerfile: str, name: str) -> str:
    marker = f" AS {name}\n"
    start = dockerfile.index(marker) + len(marker)
    remainder = dockerfile[start:]
    next_stage = remainder.find("\nFROM ")
    return remainder if next_stage < 0 else remainder[:next_stage]


def _terraform_resource(main: str, resource_type: str, name: str) -> str:
    marker = f'resource "{resource_type}" "{name}" {{'
    start = main.index(marker)
    # Resource blocks in this file are separated by a blank line and the next
    # top-level resource declaration.
    next_resource = main.find("\nresource \"", start + len(marker))
    return main[start:] if next_resource < 0 else main[start:next_resource]


def test_dockerfile_has_four_explicit_least_capability_targets() -> None:
    dockerfile = _read(SERVICE_ROOT / "Dockerfile")
    development = _docker_stage(dockerfile, "development")
    production = _docker_stage(dockerfile, "production")
    public = _docker_stage(dockerfile, "public")
    admin = _docker_stage(dockerfile, "admin")
    worker = _docker_stage(dockerfile, "worker")
    migration = _docker_stage(dockerfile, "migration")

    assert "select public, admin, worker, or migration image target" in production
    assert "app.public_main:app" in public
    assert "app.admin_main:app" in admin
    assert "app.worker_main:app" in worker
    assert "--no-access-log" in public
    assert "--no-server-header" in public
    assert "--no-access-log" in worker
    assert "--no-access-log" in admin
    assert "--no-server-header" in worker
    assert "--no-server-header" in admin
    assert "--forwarded-allow-ips" not in public
    assert "--forwarded-allow-ips" not in worker
    assert "--forwarded-allow-ips" not in admin
    assert "scripts.run_migrations" in migration
    assert "migrations" not in production
    assert "migrations" not in public
    assert "migrations" not in worker
    assert "migrations" not in admin
    assert "COPY --chown=app:app services/library-api/migrations" in migration
    assert "COPY scripts /workspace/scripts" in dockerfile
    assert "COPY compose.library-dev.yaml /workspace/compose.library-dev.yaml" in dockerfile
    assert "postgresql-client" in development
    assert "postgresql-client" not in production
    assert dockerfile.count("USER app") >= 2


def test_terraform_separates_public_admin_worker_and_migration_secrets() -> None:
    main = _read(TERRAFORM_ROOT / "main.tf")
    public = _terraform_resource(main, "google_cloud_run_v2_service", "public")
    admin = _terraform_resource(main, "google_cloud_run_v2_service", "admin")
    worker = _terraform_resource(main, "google_cloud_run_v2_service", "worker")
    migration = _terraform_resource(main, "google_cloud_run_v2_job", "migration")

    assert 'name = "DATABASE_URL"' in public
    assert "DATABASE_URL_UNPOOLED" not in public
    assert "GOOGLE_DRIVE_" not in public
    assert re.search(r'SERVICE_SURFACE\s*=\s*"public"', public)
    assert "PHASE8_ADMIN_API_ENABLED" not in public
    assert "GOOGLE_ADMIN_" not in public
    assert "LIBRARY_ADMIN_EDGE_SHARED_SECRET" not in public
    assert "TERMS_CONTENT_SHA256" in public
    assert "PRIVACY_CONTENT_SHA256" in public
    assert 'path = "/health/ready"' in public

    assert "DATABASE_URL = {" in admin
    assert "DATABASE_URL_UNPOOLED" not in admin
    assert "GOOGLE_DRIVE_OAUTH" not in admin
    assert re.search(r'SERVICE_SURFACE\s*=\s*"admin"', admin)
    assert 'PHASE6_AUTH_API_ENABLED                 = "false"' in admin
    assert 'PHASE8_ADMIN_API_ENABLED                = "true"' in admin
    assert "GOOGLE_ADMIN_OAUTH_CLIENT_IDS" in admin
    assert "GOOGLE_OAUTH_CLIENT_IDS" not in admin
    assert "ALLOWED_GOOGLE_HOSTED_DOMAINS" not in admin
    assert "GOOGLE_ADMIN_ALLOWED_EMAILS" in admin
    assert "LIBRARY_ADMIN_EDGE_SHARED_SECRET" in admin
    assert 'CORS_ALLOWED_ORIGINS                    = ""' in admin
    assert 'path = "/health/ready"' not in admin
    assert admin.count('path = "/health/live"') == 2

    assert re.search(
        r'ingress\s*=\s*"INGRESS_TRAFFIC_INTERNAL_ONLY"',
        worker,
    )
    assert "DATABASE_URL = {" in worker
    assert "DATABASE_URL_UNPOOLED" not in worker
    assert "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN" in worker
    assert "WORKER_AUTH_MODE" in worker
    assert '"cloud_run_oidc"' in worker
    assert "custom_audiences" in worker
    assert "var.worker_oidc_audience" in worker
    assert "google_cloud_run_v2_service.worker.uri" not in worker
    assert 'path = "/health/ready"' not in worker
    assert worker.count('path = "/health/live"') == 2

    assert "DATABASE_URL_UNPOOLED" in migration
    assert 'name = "DATABASE_URL"' not in migration
    assert "GOOGLE_DRIVE_" not in migration
    assert re.search(r"max_retries\s*=\s*0", migration)


def test_scheduler_uses_exact_service_account_oidc_without_custom_secret() -> None:
    main = _read(TERRAFORM_ROOT / "main.tf")
    scheduler = _terraform_resource(main, "google_cloud_scheduler_job", "worker")
    worker_iam = _terraform_resource(
        main,
        "google_cloud_run_v2_service_iam_member",
        "scheduler_worker_invoker",
    )

    assert "oidc_token" in scheduler
    assert "service_account_email = google_service_account.scheduler.email" in scheduler
    assert re.search(
        r"audience\s*=\s*var\.worker_oidc_audience",
        scheduler,
    )
    assert "retry_count = 0" in scheduler
    assert 'schedule         = "*/15 * * * *"' in scheduler
    assert 'attempt_deadline = "120s"' in scheduler
    assert "jsonencode({ limit = 20 })" in scheduler
    assert "batchSize" not in scheduler
    assert "X-Phase7" not in scheduler
    assert "X-Phase8" not in scheduler
    assert "roles/run.invoker" in worker_iam
    assert "google_service_account.scheduler.member" in worker_iam


def test_terraform_capabilities_are_fail_closed_until_confirmed() -> None:
    main = _read(TERRAFORM_ROOT / "main.tf")
    variables = _read(TERRAFORM_ROOT / "variables.tf")
    example = _read(TERRAFORM_ROOT / "terraform.tfvars.example")
    public = _terraform_resource(main, "google_cloud_run_v2_service", "public")
    admin = _terraform_resource(main, "google_cloud_run_v2_service", "admin")
    worker = _terraform_resource(main, "google_cloud_run_v2_service", "worker")
    scheduler = _terraform_resource(
        main,
        "google_cloud_scheduler_job",
        "worker",
    )
    public_invoker = _terraform_resource(
        main,
        "google_cloud_run_v2_service_iam_member",
        "public_invoker",
    )
    admin_invoker = _terraform_resource(
        main,
        "google_cloud_run_v2_service_iam_member",
        "admin_invoker",
    )
    services = _read(TERRAFORM_ROOT / "services.tf")

    assert re.search(
        r"count\s*=\s*var\.runtime_services_activation\.enabled\s*\?\s*1\s*:\s*0",
        public,
    )
    assert re.search(
        r"count\s*=\s*var\.runtime_services_activation\.enabled\s*\?\s*1\s*:\s*0",
        worker,
    )
    assert "count" not in _terraform_resource(
        main,
        "google_cloud_run_v2_job",
        "migration",
    ).split("name", 1)[0]
    assert "prevent_destroy = true" in public
    assert "prevent_destroy = true" in worker
    assert "prevent_destroy = true" in admin
    assert 'timeout                          = "120s"' in worker
    assert "var.public_ingress_activation.enabled" in public_invoker
    assert 'member   = "allUsers"' in public_invoker

    assert "PHASE8_ADMIN_API_ENABLED" not in public
    assert "PHASE8_ADMIN_ACTIVATION_CONFIRMATION" not in public
    assert "GOOGLE_ADMIN_OAUTH_CLIENT_IDS" not in public
    assert re.search(
        r"PHASE10A_EXPORT_API_ENABLED\s*=\s*"
        r"tostring\(var\.phase10a_export_activation\.enabled\)",
        admin,
    )
    assert "PHASE10A_EXPORT_ACTIVATION_CONFIRMATION" in admin
    assert "var.admin_api_activation.enabled ? 1 : 0" in admin_invoker
    assert 'member   = "allUsers"' in admin_invoker
    assert "var.admin_image" in admin
    assert re.search(
        r"API_READ_ONLY_MODE\s*=\s*"
        r"tostring\(!var\.public_api_write_activation\.enabled\)",
        public,
    )
    assert "API_WRITES_ACTIVATION_CONFIRMATION" in public

    for name in (
        "PHASE7_WORKER_API_ENABLED",
        "PHASE7_DRIVE_API_ENABLED",
        "EXTERNAL_SIDE_EFFECTS_ENABLED",
    ):
        assert f"{name}" in worker
        assert "tostring(var.worker_drive_activation.enabled)" in worker
    assert re.search(
        r"PHASE7_DRIVE_KILL_SWITCH\s*=\s*"
        r"tostring\(!var\.worker_drive_activation\.enabled\)",
        worker,
    )
    assert "PHASE7_DRIVE_ACTIVATION_CONFIRMATION" in worker
    assert 'PHASE7_DRIVE_KILL_SWITCH       = "false"' not in worker
    assert "count" in scheduler
    assert "var.worker_drive_activation.enabled ? 1 : 0" in scheduler
    assert "worker_drive_secret_bindings = " in main
    assert "var.worker_drive_activation.enabled ?" in main
    assert "cloudscheduler.googleapis.com" in services
    assert "iamcredentials.googleapis.com" in services
    assert "var.worker_drive_activation.enabled ?" in services

    assert 'variable "worker_drive_activation"' in variables
    assert "I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1" in variables
    assert 'variable "admin_api_activation"' in variables
    assert (
        "I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1"
        in variables
    )
    assert 'variable "runtime_services_activation"' in variables
    assert "I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1" in variables
    assert 'variable "cost_guardrails_review"' in variables
    assert "I_VERIFIED_CLOUD_RUN_SPEND_CAP_AND_NEAR_ZERO_COST_GUARDRAILS_V1" in variables
    assert 'variable "public_ingress_activation"' in variables
    assert "I_APPROVED_PUBLIC_CLOUD_RUN_INGRESS_AFTER_COST_AND_RECOVERY_REVIEW_V1" in variables
    assert 'variable "public_api_write_activation"' in variables
    assert "I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1" in variables
    assert 'variable "phase10a_export_activation"' in variables
    assert (
        "I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1"
        in variables
    )
    assert "Runtime-dependent capabilities must remain disabled" in main
    assert "Phase 10A export activation requires" in main
    assert "Runtime services require the reviewed near-zero cost guardrails" in main
    assert "Runtime services require at least one reviewed monitoring" in main
    assert main.count("precondition {") >= 5
    assert example.count("enabled      = false") >= 5
    assert example.count('confirmation = ""') >= 5
    assert "drive.googleapis.com" in services


def test_terraform_bootstrap_and_gcp_preflight_are_fail_closed() -> None:
    main = _read(TERRAFORM_ROOT / "main.tf")
    versions = _read(TERRAFORM_ROOT / "versions.tf")
    outputs = _read(TERRAFORM_ROOT / "outputs.tf")
    preflight = _read(
        REPOSITORY_ROOT
        / "infra"
        / "library-registration"
        / "scripts"
        / "gcp-readonly-preflight.ps1"
    )

    assert 'backend "gcs" {}' in versions
    assert "try(google_cloud_run_v2_service.public[0].uri, null)" in outputs
    assert "try(google_cloud_run_v2_service.admin[0].uri, null)" in outputs
    assert "try(google_cloud_run_v2_service.worker[0].uri, null)" in outputs
    assert "migration_secret_bindings" in main
    assert "runtime_secret_bindings = var.runtime_services_activation.enabled ?" in main
    assert "secrets', 'versions', 'access" not in preflight
    assert "external_mutations        = $false" in preflight
    assert "secret_payloads_accessed  = $false" in preflight
    assert "ValidateCount(5, 12)" in preflight
    assert "'registration-preview', 'full-production'" in preflight
    assert "AdminImage must remain empty for the registration-preview profile" in preflight
    assert "[string]$AdminImage" in preflight
    assert "fsl-admin-database-url" in preflight
    assert "fsl-admin-allowed-emails" in preflight
    assert "fsl-admin-edge-shared-secret" in preflight
    assert "fsl-drive-operation-attestation-key" in preflight
    assert "fsl-public-registration-rpc-token" in preflight
    assert "image_summary.digest" in preflight
    assert "gcs_state_bucket_secure" in preflight
    assert "artifact_registry_docker_repository" in preflight
    assert "billing_enabled" in preflight
    assert "notification_channel:" in preflight


def test_registration_preview_inventory_omits_inactive_admin_and_drive_inputs() -> None:
    preview = _read(
        TERRAFORM_ROOT / "terraform.registration-preview.tfvars.example"
    )
    main = _read(TERRAFORM_ROOT / "main.tf")

    assert not re.search(r"^admin_image\s*=", preview, re.MULTILINE)
    assert not re.search(r"^\s+admin_database_url\s*=", preview, re.MULTILINE)
    assert not re.search(r"^\s+admin_allowed_emails\s*=", preview, re.MULTILINE)
    assert not re.search(r"^\s+admin_edge_shared_secret\s*=", preview, re.MULTILINE)
    assert not re.search(r"^\s+drive_oauth_client_id\s*=", preview, re.MULTILINE)
    assert not re.search(r"^\s+drive_oauth_refresh_token\s*=", preview, re.MULTILINE)
    assert preview.count("_database_url") == 6
    assert 'resource "google_service_account" "admin" {' in main
    assert (
        "count        = var.runtime_services_activation.enabled && "
        "var.admin_api_activation.enabled ? 1 : 0"
    ) in main


def test_secret_versions_are_pinned_and_no_payload_is_in_terraform() -> None:
    main = _read(TERRAFORM_ROOT / "main.tf")
    variables = _read(TERRAFORM_ROOT / "variables.tf")
    example = _read(TERRAFORM_ROOT / "terraform.tfvars.example")

    assert 'version = "latest"' not in main
    assert 'regex("^[1-9][0-9]*$"' in variables
    assert "secret_versions = {" in example
    assert "admin_allowed_emails" in variables
    assert "admin_allowed_emails" in example
    assert "admin_edge_shared_secret" in variables
    assert "admin_edge_shared_secret" in example
    assert "GOOGLE_ADMIN_ALLOWED_EMAILS" in main
    assert "admin_secret_bindings" in main
    assert "admin_database_url" in variables
    assert "admin_database_url" in example
    assert "drive_operation_attestation_key" in variables
    assert "drive_operation_attestation_key" in example
    assert "DRIVE_OPERATION_ATTESTATION_KEY" in main
    assert "public_registration_rpc_token" in variables
    assert "public_registration_rpc_token" in example
    assert "PUBLIC_REGISTRATION_RPC_TOKEN" in main
    assert "Admin API activation requires its immutable image plus pinned" in main
    assert 'optional(string, "")' in variables
    assert "postgresql://" not in example
    assert "npg_" not in example
    assert "ya29." not in example
    assert "-----BEGIN" not in example


def test_database_role_scripts_enforce_expected_privilege_boundary() -> None:
    bootstrap = _read(SERVICE_ROOT / "scripts" / "bootstrap_database_roles.sql")
    binding = _read(SERVICE_ROOT / "scripts" / "bind_database_roles.sql")
    grants = _read(SERVICE_ROOT / "scripts" / "grant_database_privileges.sql")
    audit = _read(SERVICE_ROOT / "scripts" / "audit_database_roles.sql")
    wrapper = _read(SERVICE_ROOT / "scripts" / "database_roles.ps1")
    migration_environment = _read(SERVICE_ROOT / "migrations" / "env.py")
    public_rpc_migration = _read(
        SERVICE_ROOT
        / "migrations"
        / "versions"
        / "e9f0a1b2c3d4_public_registration_rpc_boundary.py"
    )
    public_rpc_sql = _read(
        SERVICE_ROOT / "migrations" / "sql" / "fsl_public_api_v1.sql"
    )
    local_roles = _read(SERVICE_ROOT / "scripts" / "local_database_roles.py")

    for role in (
        "fsl_api_runtime",
        "fsl_admin_runtime",
        "fsl_worker_runtime",
        "fsl_migration",
        "fsl_backup_restore",
    ):
        assert f"CREATE ROLE {role} NOLOGIN NOSUPERUSER" in bootstrap
    assert "ALTER SCHEMA public OWNER TO fsl_migration" in bootstrap
    assert "REVOKE ALL ON SCHEMA public FROM PUBLIC" in bootstrap
    assert "ALTER TABLE %I.%I OWNER TO fsl_migration" in bootstrap
    assert "ALTER SEQUENCE %I.%I OWNER TO fsl_migration" in bootstrap
    assert "ALTER FUNCTION %I.%I(%s) OWNER TO fsl_migration" in bootstrap
    assert "DO $migration_admin_membership$" in bootstrap
    assert "FROM pg_auth_members AS membership" in bootstrap
    assert "membership.admin_option, membership.set_option" in bootstrap
    assert "GRANT fsl_migration TO %I WITH SET TRUE" in bootstrap
    assert "WITH ADMIN TRUE, SET TRUE, INHERIT FALSE" in bootstrap
    assert "GRANT fsl_migration TO CURRENT_USER WITH ADMIN OPTION" not in bootstrap
    assert "GRANT CREATE ON DATABASE %I TO fsl_migration" in bootstrap
    assert "current_database()" in bootstrap
    assert "ALTER DEFAULT PRIVILEGES IN SCHEMA public" in grants
    assert "GRANT fsl_migration TO" in binding
    assert "SET ROLE fsl_migration" in grants
    assert "current_user = 'fsl_migration'" in grants
    assert "RESET ROLE" in grants
    assert "\\quit" not in binding
    assert "\\quit" not in grants
    assert "\\quit" not in audit
    assert "database_role_audit_failed" in audit
    assert "database_create_boundary_valid" in audit
    assert (
        "has_database_privilege(\n"
        "           'fsl_api_runtime', current_database(), 'CREATE'"
        in audit
    )
    assert "FSL_DATABASE_MIGRATION_URL" in wrapper
    assert 'MIGRATION_CAPABILITY_ROLE = "fsl_migration"' in migration_environment
    assert "SET ROLE {MIGRATION_CAPABILITY_ROLE}" in migration_environment
    assert 'exec_driver_sql("SELECT current_user")' in migration_environment
    assert "context.is_offline_mode()" in public_rpc_migration
    assert 'op.execute(sql.replace(":", r"\\:"))' in public_rpc_migration
    assert "op.get_bind().exec_driver_sql(sql)" in public_rpc_migration
    assert "op.execute(SQL_PATH.read_text" not in public_rpc_migration
    assert public_rpc_sql.count(")::text") >= 2
    assert "LOCAL_HOSTS" in local_roles
    assert "bootstrap_and_bind_local_database" in local_roles
    assert "grant_and_audit_local_database" in local_roles
    assert "capture_output=True" in local_roles
    assert "GRANT SELECT ON TABLE public.library_admins TO fsl_admin_runtime" in grants
    assert "GRANT SELECT, INSERT ON TABLE public.library_admin_audit TO fsl_admin_runtime" in grants
    assert "GRANT SELECT, INSERT ON TABLE public.library_export_runs TO fsl_admin_runtime" in grants
    assert "GRANT fsl_admin_runtime TO" in binding
    assert '"admin_runtime_login": username' in local_roles
    assert "FSL_ADMIN_RUNTIME_LOGIN" in wrapper
    assert "[switch]$RegistrationOnly" in wrapper
    assert "Registration-only binding refuses an admin runtime login." in wrapper
    assert '\\if :{?admin_runtime_login}' in binding
    assert """GRANT SELECT ON TABLE
    public.library_members,
    public.library_identities,
    public.library_applications
TO fsl_worker_runtime;""" in grants
    assert "public.library_resource_leases TO fsl_worker_runtime" in grants
    assert "public.alembic_version TO fsl_api_runtime" in grants
    assert "GRANT USAGE ON SCHEMA fsl_public_api TO fsl_api_runtime" in grants
    assert "fsl_public_api.submit_registration_v1(jsonb, text)" in grants
    assert (
        "fsl_public_api.registration_status_v1(uuid, text, text, text)"
        in grants
    )
    assert "SELECT, INSERT ON TABLE public.library_members TO fsl_api_runtime" not in grants
    assert "ALL TABLES IN SCHEMA fsl_private" in grants
    assert "public_api_functions_hardened" in audit
    assert "api_raw_table_grants_absent" in audit
    assert "api_raw_sequence_grants_absent" in audit
    assert "public.alembic_version TO fsl_worker_runtime" in grants
    assert "library_import_batches" not in grants
    assert "library_import_rows" not in grants
    assert "REVOKE INSERT, UPDATE, DELETE" in grants
    assert "has_schema_privilege('fsl_api_runtime', 'public', 'CREATE')" in audit
    assert "has_schema_privilege('fsl_admin_runtime', 'public', 'CREATE')" in audit
    assert "has_schema_privilege('fsl_worker_runtime', 'public', 'CREATE')" in audit
    assert "n.nspowner = migration.oid" in audit
    assert "application_tables_owned" in audit
    assert "application_sequences_owned" in audit
    assert "application_functions_owned" in audit
    assert "c.relowner = migration.oid" in audit
    assert "NOT rolinherit" in audit
    assert "has_table_privilege('fsl_api_runtime', 'public.library_import_batches', 'SELECT')" in audit
    assert "has_table_privilege('fsl_api_runtime', 'public.library_export_runs', 'SELECT')" in audit
    assert "admin_required_grants" in audit
    assert "worker_required_grants" in audit
    assert "('public.library_identities', 'SELECT')" in audit
    assert "('public.library_applications', 'SELECT')" in audit
    assert "database_role_audit=pass" in audit


def test_synthetic_backup_restore_scripts_are_destructive_action_guarded() -> None:
    backup = _read(SERVICE_ROOT / "scripts" / "backup_synthetic.ps1")
    restore = _read(SERVICE_ROOT / "scripts" / "restore_synthetic.ps1")
    verifier = _read(SERVICE_ROOT / "scripts" / "verify_synthetic_restore.py")

    assert "synthetic-only" in backup
    assert "Backup artifacts must be stored outside the Git worktree" in backup
    assert "Refusing to overwrite" in backup
    assert "--format=custom" in backup
    assert "--exclude-table-data=fsl_private.public_registration_rpc_keys" in backup
    assert "Get-FileHash -Algorithm SHA256" in backup

    assert "restore-synthetic-only" in restore
    assert "FSL_RESTORE_TARGET_CONFIRM" in restore
    assert "Target emptiness check" in restore
    assert "& pg_restore --clean" not in restore
    assert "--single-transaction" in restore
    assert "Backup SHA-256 verification failed" in restore
    assert "scripts.provision_public_rpc_key" in restore
    assert "bootstrap_database_roles.sql" in restore
    assert "grant_database_privileges.sql" in restore
    assert "audit_database_roles.sql" in restore

    assert "alembic_version" in verifier
    assert "pg_constraint" in verifier
    assert "library_admin_audit" in verifier
    assert "source != restored" in verifier


def test_public_rpc_key_rotation_is_staged_and_secret_safe() -> None:
    provisioner = _read(
        SERVICE_ROOT / "scripts" / "provision_public_rpc_key.py"
    )

    assert "sha256(token_bytes).digest()" in provisioner
    assert "hmac.compare_digest" in provisioner
    assert "PUBLIC_REGISTRATION_RPC_RETIRE_VERSION" in provisioner
    assert "PUBLIC_REGISTRATION_RPC_RETIRE_CONFIRMATION" in provisioner
    assert "retire-{retire_version}-after-{active_version}-ready" in provisioner
    assert "retire_version == active_version" in provisioner
    assert "LOCK TABLE fsl_private.public_registration_rpc_keys" in provisioner
    assert "SET active = false, retired_at = clock_timestamp()" in provisioner
    assert "DELETE FROM fsl_private.public_registration_rpc_keys" not in provisioner
    assert "print(token" not in provisioner
    assert "print(digest" not in provisioner


def test_migration_entrypoint_refuses_pooler_or_non_tls_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv(
        "DATABASE_URL_UNPOOLED",
        "postgresql+psycopg://u:p@ep-test-pooler.example/db?sslmode=require",
    )
    with pytest.raises(RuntimeError, match="pooled"):
        _require_direct_url()

    monkeypatch.setenv(
        "DATABASE_URL_UNPOOLED",
        "postgresql+psycopg://u:p@ep-test.example/db",
    )
    with pytest.raises(RuntimeError, match="TLS"):
        _require_direct_url()

    direct = "postgresql+psycopg://u:p@ep-test.example/db?sslmode=require"
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", direct)
    assert _require_direct_url() == direct


def test_phase8a_load_guard_refuses_remote_or_external_side_effects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FSL_DATA_CLASSIFICATION", "synthetic-only")
    monkeypatch.setenv("FSL_PHASE8A_LOCAL_EVIDENCE", "confirmed")
    monkeypatch.setenv("EXTERNAL_SIDE_EFFECTS_ENABLED", "false")
    monkeypatch.setenv("PHASE7_DRIVE_API_ENABLED", "false")
    monkeypatch.setenv("PHASE7_DRIVE_KILL_SWITCH", "true")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:p@remote.example/fsl_synthetic",
    )
    with pytest.raises(RuntimeError, match="localhost"):
        _guard_local_synthetic_url()

    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:p@127.0.0.1/fsl_synthetic",
    )
    monkeypatch.setenv("EXTERNAL_SIDE_EFFECTS_ENABLED", "true")
    with pytest.raises(RuntimeError, match="must be false"):
        _guard_local_synthetic_url()


def test_phase8a_local_evidence_wrapper_is_isolated_and_finite() -> None:
    wrapper = _read(
        SERVICE_ROOT / "scripts" / "phase8a_local_postgres_evidence.ps1"
    )
    load = _read(SERVICE_ROOT / "scripts" / "verify_phase8a_local_load.py")

    assert "fsl-phase8a-local-evidence" in wrapper
    assert "127.0.0.1:${port}:5432" in wrapper
    assert "postgres:17-bookworm" in wrapper
    assert "pg_isready -h 127.0.0.1" in wrapper
    assert "pg_dump --format=custom" in wrapper
    assert "--exclude-table-data=fsl_private.public_registration_rpc_keys" in wrapper
    assert "pg_restore --exit-on-error --single-transaction" in wrapper
    assert "bootstrap_database_roles.sql" in wrapper
    assert "bind_database_roles.sql" in wrapper
    assert "grant_database_privileges.sql" in wrapper
    assert "audit_database_roles.sql" in wrapper
    assert "scripts.provision_public_rpc_key" in wrapper
    assert "admin_runtime_login=postgres" in wrapper
    assert "ConvertFrom-Json).'com.compass.project'" in wrapper
    assert "docker rm -f $containerName" in wrapper
    assert "incomplete_or_interrupted" in wrapper
    assert "phase8a_local_evidence_failed" in wrapper
    assert "Move-Item -LiteralPath $temporaryPath" in wrapper
    assert "COMPASS Interactive" not in wrapper

    assert "REGISTRATION_COUNT = 200" in load
    assert "CONCURRENCY = 2" in load
    assert "ThreadPoolExecutor(max_workers=CONCURRENCY)" in load
    assert "remote_services_contacted" in load
    assert "synthetic-load-" in load


def test_local_preproduction_gate_is_synthetic_and_stops_docker() -> None:
    gate = _read(REPOSITORY_ROOT / "scripts" / "library-local-preproduction-gate.ps1")
    docker = _read(REPOSITORY_ROOT / "scripts" / "library-docker-dev.ps1")
    compose = _read(REPOSITORY_ROOT / "compose.library-dev.yaml")
    race_evidence = _read(
        SERVICE_ROOT / "scripts" / "verify_phase10a_api_races_postgres.py"
    )

    assert "COMPASS[ _-]*Interactive" in gate
    assert "NEXT_PUBLIC_LIBRARY_REGISTRATION_MODE = 'mock'" in gate
    assert "NEXT_PUBLIC_LIBRARY_ADMIN_MODE = 'mock'" in gate
    assert "'LIBRARY_RELEASE_TARGET'" in gate
    assert "'NEXT_DIST_DIR'" in gate
    assert "'GOOGLE_OAUTH_CLIENT_IDS'" in gate
    assert "'PHASE6_AUTH_API_ENABLED'" in gate
    assert "'PHASE7_WORKER_API_ENABLED'" in gate
    assert "'PHASE8_ADMIN_API_ENABLED'" in gate
    assert 'Remove-Item "Env:$name"' in gate
    assert "PHASE7_DRIVE_API_ENABLED = 'false'" in gate
    assert "EXTERNAL_SIDE_EFFECTS_ENABLED = 'false'" in gate
    assert "FSL_DATA_CLASSIFICATION = 'synthetic-only'" in gate
    assert "Get-SourceIntegritySnapshot" in gate
    assert "Assert-SourceSnapshotUnchanged" in gate
    assert "worktree_must_be_clean" in gate
    assert "source_changed_during_gate" in gate
    assert "source_snapshot_pre" in gate
    assert "source_snapshot_post" in gate
    assert "source_integrity_pre_run" in gate
    assert "git ls-files --cached --others --exclude-standard" in gate
    assert "source_manifest_sha256" in gate
    assert "matching values are never printed" in gate
    assert "-Action BuildProductionImages" in gate
    assert "-Action TerraformValidate" in gate
    assert "library-frontend-production-rehearsal.ps1" in gate
    assert "frontend_rehearsal_isolation" in gate
    assert "frontend_production_shaped_rehearsal" in gate
    assert "-Action Test" in gate
    assert "-Action Phase9Phase10Test" in gate
    assert "phase8a_local_postgres_evidence.ps1" in gate
    assert "-Action Down" in gate
    assert "docker_cleanup_failed" in gate
    assert gate.index("$results['docker_cleanup'] = 'pass'") < gate.index(
        "$evidence | ConvertTo-Json"
    )
    assert "google_drive_neon_cloudrun_contacted = $false" in gate
    assert "container_registry_access_may_occur = $true" in gate
    assert "terraform_registry_access_may_occur = $true" in gate
    assert "production_acceptance = $false" in gate

    assert "BuildProductionImages" in docker
    assert "--target $target" in docker
    assert "TerraformValidate" in docker
    assert "hashicorp/terraform:1.9.8" in docker
    assert "init', '-backend=false', '-input=false" in docker
    assert "validate', '-no-color" in docker
    assert "'test', '-no-color" in docker
    assert "roles-finalize" in docker
    assert "internal: true" in compose
    assert "pg_isready -h 127.0.0.1" in compose
    assert "roles-bootstrap:" in compose
    assert "roles-finalize:" in compose
    assert "scripts.local_database_roles" in compose
    assert "condition: service_completed_successfully" in compose
    assert compose.index("roles-bootstrap:") < compose.index("  migrate:")
    assert compose.index("  migrate:") < compose.index("roles-finalize:")
    assert "bootstrap_and_bind_local_database(temporary_url)" in race_evidence
    assert "grant_and_audit_local_database(temporary_url)" in race_evidence
    assert race_evidence.index(
        "bootstrap_and_bind_local_database(temporary_url)"
    ) < race_evidence.index("_run_migrations(temporary_url)")
    assert race_evidence.index("_run_migrations(temporary_url)") < race_evidence.index(
        "grant_and_audit_local_database(temporary_url)"
    )
    assert "Wait-ComposeServiceHealthy" in docker
    assert "State.Health.Status" in docker
    assert "PHASE5_LOCAL_API_ENABLED=false" in docker
    assert "Invoke-RestMethod -Uri 'http://127.0.0.1:58000/health'" not in docker


def test_restore_guard_allows_only_local_synthetic_or_tls_direct(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FSL_PHASE8A_LOCAL_EVIDENCE", "confirmed")
    monkeypatch.setenv(
        "FSL_RESTORE_DATABASE_URL",
        "postgresql+psycopg://postgres:p@127.0.0.1/fsl_production",
    )
    with pytest.raises(RuntimeError, match="direct PostgreSQL"):
        restore_direct_url("FSL_RESTORE_DATABASE_URL")

    local = "postgresql+psycopg://postgres:p@127.0.0.1/fsl_restore_synthetic"
    monkeypatch.setenv("FSL_RESTORE_DATABASE_URL", local)
    assert restore_direct_url("FSL_RESTORE_DATABASE_URL") == local

    monkeypatch.delenv("FSL_PHASE8A_LOCAL_EVIDENCE")
    monkeypatch.setenv(
        "FSL_RESTORE_DATABASE_URL",
        "postgresql+psycopg://restore:p@ep-direct.example/db?sslmode=require",
    )
    assert "sslmode=require" in restore_direct_url("FSL_RESTORE_DATABASE_URL")
