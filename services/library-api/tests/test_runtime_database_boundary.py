import pytest

from app.db.runtime_boundary import (
    RuntimeDatabaseBoundaryError,
    validate_runtime_database_capabilities,
)


def _base_capabilities(role: str) -> dict[str, object]:
    keys = {
        "is_superuser",
        "can_create_role",
        "can_create_database",
        "can_replicate",
        "can_bypass_rls",
        "is_login",
        "inherits_privileges",
        "is_database_owner",
        "has_unexpected_role_membership",
        "can_create_schema_objects",
        "public_api_schema_usage",
        "public_api_schema_create",
        "private_schema_usage",
        "private_rpc_keys_select",
        "submit_registration_rpc_execute",
        "registration_status_rpc_execute",
        "enqueue_manual_review_notification_rpc_execute",
        "no_unknown_public_api_execute",
        "public_api_functions_hardened",
        "raw_library_table_acl_absent",
        "raw_library_sequence_acl_absent",
        "is_api_runtime_member",
        "is_admin_runtime_member",
        "is_worker_runtime_member",
        "is_migration_member",
        "is_backup_member",
        "members_select",
        "members_insert",
        "members_update",
        "members_delete",
        "identities_select",
        "identities_insert",
        "identities_update",
        "identities_delete",
        "applications_select",
        "applications_insert",
        "applications_update",
        "applications_delete",
        "grants_select",
        "grants_insert",
        "grants_update",
        "grants_delete",
        "operations_select",
        "operations_insert",
        "operations_update",
        "operations_delete",
        "leases_select",
        "leases_insert",
        "leases_update",
        "leases_delete",
        "admins_select",
        "admins_insert",
        "admins_update",
        "admins_delete",
        "audit_select",
        "audit_insert",
        "audit_update",
        "audit_delete",
        "exports_select",
        "exports_insert",
        "exports_update",
        "exports_delete",
        "import_batches_select",
        "import_batches_insert",
        "import_batches_update",
        "import_batches_delete",
        "import_rows_select",
        "import_rows_insert",
        "import_rows_update",
        "import_rows_delete",
        "alembic_select",
    }
    return {"current_role": role, **dict.fromkeys(keys, False)}


def _public_capabilities() -> dict[str, object]:
    values = _base_capabilities("fsl_api_login")
    for key in {
        "is_login",
        "inherits_privileges",
        "is_api_runtime_member",
        "public_api_schema_usage",
        "submit_registration_rpc_execute",
        "registration_status_rpc_execute",
        "enqueue_manual_review_notification_rpc_execute",
        "no_unknown_public_api_execute",
        "public_api_functions_hardened",
        "raw_library_table_acl_absent",
        "raw_library_sequence_acl_absent",
        "alembic_select",
    }:
        values[key] = True
    return values


def _worker_capabilities() -> dict[str, object]:
    values = _base_capabilities("fsl_worker_login")
    for key in {
        "is_login",
        "inherits_privileges",
        "is_worker_runtime_member",
        "members_select",
        "identities_select",
        "applications_select",
        "grants_select",
        "grants_update",
        "operations_select",
        "operations_update",
        "leases_select",
        "leases_insert",
        "leases_update",
        "alembic_select",
    }:
        values[key] = True
    return values


def _admin_capabilities() -> dict[str, object]:
    values = _base_capabilities("fsl_console_login")
    for key in {
        "is_login",
        "inherits_privileges",
        "is_admin_runtime_member",
        "members_select",
        "members_update",
        "identities_select",
        "applications_select",
        "applications_update",
        "grants_select",
        "grants_insert",
        "grants_update",
        "operations_select",
        "operations_insert",
        "operations_update",
        "admins_select",
        "audit_select",
        "audit_insert",
        "exports_select",
        "exports_insert",
        "alembic_select",
    }:
        values[key] = True
    return values


def test_public_runtime_accepts_only_reviewed_least_privilege_shape() -> None:
    validate_runtime_database_capabilities(
        _public_capabilities(),
        surface="public",
        expected_role="fsl_api_login",
    )


@pytest.mark.parametrize(
    "capability",
    [
        "is_superuser",
        "can_create_schema_objects",
        "can_replicate",
        "is_database_owner",
        "has_unexpected_role_membership",
        "is_migration_member",
        "admins_update",
        "members_delete",
        "members_update",
        "applications_update",
        "grants_update",
        "operations_update",
        "exports_update",
        "private_schema_usage",
        "private_rpc_keys_select",
        "members_select",
        "identities_insert",
    ],
)
def test_public_runtime_rejects_excess_privileges(capability: str) -> None:
    values = _public_capabilities()
    values[capability] = True

    with pytest.raises(
        RuntimeDatabaseBoundaryError,
        match="runtime_database_privilege_mismatch",
    ):
        validate_runtime_database_capabilities(
            values,
            surface="public",
            expected_role="fsl_api_login",
        )


def test_public_runtime_rejects_owner_or_wrong_login() -> None:
    values = _public_capabilities()
    values["current_role"] = "neondb_owner"

    with pytest.raises(
        RuntimeDatabaseBoundaryError,
        match="unexpected_runtime_database_role",
    ):
        validate_runtime_database_capabilities(
            values,
            surface="public",
            expected_role="fsl_api_login",
        )


@pytest.mark.parametrize(
    "capability",
    [
        "public_api_schema_usage",
        "submit_registration_rpc_execute",
        "registration_status_rpc_execute",
        "enqueue_manual_review_notification_rpc_execute",
        "no_unknown_public_api_execute",
        "public_api_functions_hardened",
        "raw_library_table_acl_absent",
        "raw_library_sequence_acl_absent",
    ],
)
def test_public_runtime_rejects_missing_rpc_boundary(
    capability: str,
) -> None:
    values = _public_capabilities()
    values[capability] = False

    with pytest.raises(
        RuntimeDatabaseBoundaryError,
        match="runtime_database_privilege_mismatch",
    ):
        validate_runtime_database_capabilities(
            values,
            surface="public",
            expected_role="fsl_api_login",
        )


def test_admin_runtime_accepts_only_management_privileges() -> None:
    validate_runtime_database_capabilities(
        _admin_capabilities(),
        surface="admin",
        expected_role="fsl_console_login",
    )


@pytest.mark.parametrize(
    "capability",
    [
        "is_api_runtime_member",
        "is_worker_runtime_member",
        "members_insert",
        "identities_update",
        "leases_select",
        "admins_update",
    ],
)
def test_admin_runtime_rejects_cross_surface_or_excess_privilege(
    capability: str,
) -> None:
    values = _admin_capabilities()
    values[capability] = True

    with pytest.raises(
        RuntimeDatabaseBoundaryError,
        match="runtime_database_privilege_mismatch",
    ):
        validate_runtime_database_capabilities(
            values,
            surface="admin",
            expected_role="fsl_console_login",
        )


def test_worker_runtime_accepts_worker_only_privileges() -> None:
    validate_runtime_database_capabilities(
        _worker_capabilities(),
        surface="worker",
        expected_role="fsl_worker_login",
    )


def test_worker_runtime_rejects_admin_roster_access() -> None:
    values = _worker_capabilities()
    values["admins_select"] = True

    with pytest.raises(
        RuntimeDatabaseBoundaryError,
        match="runtime_database_privilege_mismatch",
    ):
        validate_runtime_database_capabilities(
            values,
            surface="worker",
            expected_role="fsl_worker_login",
        )
