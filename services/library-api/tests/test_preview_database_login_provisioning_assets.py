from __future__ import annotations

from pathlib import Path
import re


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (SERVICE_ROOT / relative_path).read_text(encoding="utf-8")


def test_preview_login_provisioner_has_a_fixed_least_privilege_role_set() -> None:
    script = _read("scripts/provision_preview_database_logins.ps1")

    fixed_roles = set(re.findall(r"'((?:fsl_preview_)[a-z_]+_login)'", script))
    assert fixed_roles == {
        "fsl_preview_api_login",
        "fsl_preview_worker_login",
        "fsl_preview_migration_login",
        "fsl_preview_backup_restore_login",
        "fsl_preview_admin_login",
    }
    assert "[switch]$IncludeAdmin" in script
    assert "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS" in script
    assert "LOGIN INHERIT" in script
    assert "database owner reuse is refused" in script
    assert "superuser provisioning is refused" in script
    assert "fixed preview role has unexpected membership" in script
    assert "fixed preview role owns database objects" in script


def test_preview_login_provisioner_requires_neon_direct_tls_channel_binding() -> None:
    script = _read("scripts/provision_preview_database_logins.ps1")

    assert "FSL_PREVIEW_DATABASE_OWNER_URL" in script
    assert "[EnvironmentVariableTarget]::Process" in script
    assert "pooled owner URLs are refused" in script
    assert "sslmode=require and channel_binding=require only" in script
    assert "PGSSLMODE = 'require'" in script
    assert "PGCHANNELBINDING = 'require'" in script
    assert "database.datdba = role.oid" in script
    assert "role.rolsuper" in script
    assert "role.rolcreaterole" in script
    assert "-OwnerUrl" not in script


def test_preview_login_passwords_only_reach_psql_over_stdin_and_dpapi() -> None:
    script = _read("scripts/provision_preview_database_logins.ps1")

    assert "RandomNumberGenerator" in script
    assert "New-Object byte[] 48" in script
    assert "HashSet[string]" in script
    assert "RedirectStandardInput = $true" in script
    assert "$process.StandardInput.Write($Sql)" in script
    assert "PASSWORD %L" in script
    assert "--command" not in script
    assert "--file" not in script
    assert "DataProtectionScope]::CurrentUser" in script
    assert "ProtectedData]::Protect" in script
    assert "ProtectedData]::Unprotect" in script
    assert "Set-CurrentUserOnlyAcl" in script
    assert "check-ignore --quiet --no-index" in script
    assert "credentials_printed=false" in script
    assert "Write-Output $entry.direct_url" not in script
    assert "Write-Output $entry.pooled_url" not in script
    assert "Write-Output $entry.password" not in script


def test_preview_login_provisioner_is_replay_safe_and_fails_closed() -> None:
    script = _read("scripts/provision_preview_database_logins.ps1")

    assert "provision-fixed-preview-login-roles" in script
    assert "state = 'pending'" in script
    assert "$Bundle.state -notin @('pending', 'provisioned')" in script
    assert "without this user DPAPI credential bundle" in script
    assert "ALTER ROLE %I LOGIN INHERIT" in script
    assert "ALTER ROLE %I LOGIN INHERIT NOSUPERUSER" not in script
    assert "Persist the generated credentials before the transaction" in script
    assert "detailed output was suppressed" in script
    assert "The post-provision fixed-role audit did not return the expected count" in script


def test_postgresql17_bootstrap_does_not_regrant_admin_to_its_grantor() -> None:
    bootstrap = _read("scripts/bootstrap_database_roles.sql")

    assert "DO $migration_admin_membership$" in bootstrap
    assert "FROM pg_auth_members AS membership" in bootstrap
    assert "membership.member = owner_role_oid" in bootstrap
    assert "membership.admin_option" in bootstrap
    assert "membership.set_option" in bootstrap
    assert "ELSIF NOT membership_can_set" in bootstrap
    assert "GRANT fsl_migration TO %I WITH SET TRUE" in bootstrap
    assert "WITH ADMIN TRUE, SET TRUE, INHERIT FALSE" in bootstrap
    assert "GRANT fsl_migration TO CURRENT_USER WITH ADMIN OPTION" not in bootstrap
