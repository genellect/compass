from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import text
from sqlalchemy.orm import Session


class RuntimeDatabaseBoundaryError(RuntimeError):
    """Raised when a production runtime connection is over-privileged."""


_CAPABILITY_SQL = """
SELECT
    current_user AS current_role,
    role.rolsuper AS is_superuser,
    role.rolcreaterole AS can_create_role,
    role.rolcreatedb AS can_create_database,
    role.rolreplication AS can_replicate,
    role.rolbypassrls AS can_bypass_rls,
    role.rolcanlogin AS is_login,
    role.rolinherit AS inherits_privileges,
    EXISTS (
        SELECT 1
        FROM pg_database AS database
        WHERE database.datname = current_database()
          AND database.datdba = role.oid
    ) AS is_database_owner,
    EXISTS (
        SELECT 1
        FROM pg_roles AS granted_role
        WHERE granted_role.rolname <> current_user
          AND pg_has_role(current_user, granted_role.oid, 'MEMBER')
          AND granted_role.rolname NOT IN (
              'fsl_api_runtime',
              'fsl_admin_runtime',
              'fsl_worker_runtime',
              'fsl_migration',
              'fsl_backup_restore'
          )
    ) AS has_unexpected_role_membership,
    has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema_objects,
    has_schema_privilege(current_user, 'fsl_public_api', 'USAGE') AS public_api_schema_usage,
    has_schema_privilege(current_user, 'fsl_public_api', 'CREATE') AS public_api_schema_create,
    has_schema_privilege(current_user, 'fsl_private', 'USAGE') AS private_schema_usage,
    COALESCE(
        (
            SELECT has_table_privilege(current_user, private_table.oid, 'SELECT')
            FROM pg_class AS private_table
            JOIN pg_namespace AS private_schema
              ON private_schema.oid = private_table.relnamespace
            WHERE private_schema.nspname = 'fsl_private'
              AND private_table.relname = 'public_registration_rpc_keys'
              AND private_table.relkind IN ('r', 'p')
        ),
        FALSE
    ) AS private_rpc_keys_select,
    has_function_privilege(
        current_user,
        'fsl_public_api.submit_registration_v1(jsonb,text)',
        'EXECUTE'
    ) AS submit_registration_rpc_execute,
    has_function_privilege(
        current_user,
        'fsl_public_api.registration_status_v1(uuid,text,text,text)',
        'EXECUTE'
    ) AS registration_status_rpc_execute,
    has_function_privilege(
        current_user,
        'fsl_public_api.enqueue_manual_review_notification_v1(uuid,text,uuid,text,text)',
        'EXECUTE'
    ) AS enqueue_manual_review_notification_rpc_execute,
    NOT EXISTS (
        SELECT 1
        FROM pg_proc AS function
        JOIN pg_namespace AS function_schema
          ON function_schema.oid = function.pronamespace
        WHERE function_schema.nspname = 'fsl_public_api'
          AND has_function_privilege(current_user, function.oid, 'EXECUTE')
          AND NOT (
              function.proname = 'submit_registration_v1'
              AND pg_get_function_identity_arguments(function.oid) =
                  'p_request jsonb, p_rpc_token text'
              OR function.proname = 'registration_status_v1'
              AND pg_get_function_identity_arguments(function.oid) =
                  'p_application_id uuid, p_authentication_subject_hash text, p_rpc_key_version text, p_rpc_token text'
              OR function.proname = 'enqueue_manual_review_notification_v1'
              AND pg_get_function_identity_arguments(function.oid) =
                  'p_application_id uuid, p_authentication_subject_hash text, p_candidate_notification_id uuid, p_rpc_key_version text, p_rpc_token text'
          )
    ) AS no_unknown_public_api_execute,
    (
        SELECT count(*) = 3
           AND bool_and(
               function.prosecdef
               AND NOT function.proleakproof
               AND owner.rolname = 'fsl_migration'
               AND function.proconfig @> ARRAY['search_path=pg_catalog']::text[]
               AND position('EXECUTE ' IN upper(function.prosrc)) = 0
               AND (
                   function.proname = 'submit_registration_v1'
                   AND function.provolatile = 'v'
                   AND pg_get_function_identity_arguments(function.oid) =
                       'p_request jsonb, p_rpc_token text'
                   OR function.proname = 'registration_status_v1'
                   AND function.provolatile = 's'
                   AND pg_get_function_identity_arguments(function.oid) =
                       'p_application_id uuid, p_authentication_subject_hash text, p_rpc_key_version text, p_rpc_token text'
                   OR function.proname = 'enqueue_manual_review_notification_v1'
                   AND function.provolatile = 'v'
                   AND pg_get_function_identity_arguments(function.oid) =
                       'p_application_id uuid, p_authentication_subject_hash text, p_candidate_notification_id uuid, p_rpc_key_version text, p_rpc_token text'
               )
           )
        FROM pg_proc AS function
        JOIN pg_namespace AS function_schema
          ON function_schema.oid = function.pronamespace
        JOIN pg_roles AS owner ON owner.oid = function.proowner
        WHERE function_schema.nspname = 'fsl_public_api'
    ) AS public_api_functions_hardened,
    NOT EXISTS (
        SELECT 1
        FROM pg_class AS raw_table
        JOIN pg_namespace AS raw_schema ON raw_schema.oid = raw_table.relnamespace
        WHERE raw_schema.nspname = 'public'
          AND left(raw_table.relname, 8) = 'library_'
          AND raw_table.relkind IN ('r', 'p')
          AND (
              has_table_privilege(current_user, raw_table.oid, 'SELECT')
              OR has_table_privilege(current_user, raw_table.oid, 'INSERT')
              OR has_table_privilege(current_user, raw_table.oid, 'UPDATE')
              OR has_table_privilege(current_user, raw_table.oid, 'DELETE')
              OR has_table_privilege(current_user, raw_table.oid, 'TRUNCATE')
              OR has_table_privilege(current_user, raw_table.oid, 'REFERENCES')
              OR has_table_privilege(current_user, raw_table.oid, 'TRIGGER')
              OR EXISTS (
                  SELECT 1
                  FROM pg_attribute AS raw_column
                  WHERE raw_column.attrelid = raw_table.oid
                    AND raw_column.attnum > 0
                    AND NOT raw_column.attisdropped
                    AND (
                        has_column_privilege(
                            current_user,
                            raw_table.oid,
                            raw_column.attnum,
                            'SELECT'
                        )
                        OR has_column_privilege(
                            current_user,
                            raw_table.oid,
                            raw_column.attnum,
                            'INSERT'
                        )
                        OR has_column_privilege(
                            current_user,
                            raw_table.oid,
                            raw_column.attnum,
                            'UPDATE'
                        )
                        OR has_column_privilege(
                            current_user,
                            raw_table.oid,
                            raw_column.attnum,
                            'REFERENCES'
                        )
                    )
              )
          )
    ) AS raw_library_table_acl_absent,
    NOT EXISTS (
        SELECT 1
        FROM pg_class AS raw_sequence
        JOIN pg_namespace AS raw_schema
          ON raw_schema.oid = raw_sequence.relnamespace
        WHERE raw_schema.nspname = 'public'
          AND left(raw_sequence.relname, 8) = 'library_'
          AND raw_sequence.relkind = 'S'
          AND (
              has_sequence_privilege(current_user, raw_sequence.oid, 'USAGE')
              OR has_sequence_privilege(current_user, raw_sequence.oid, 'SELECT')
              OR has_sequence_privilege(current_user, raw_sequence.oid, 'UPDATE')
          )
    ) AS raw_library_sequence_acl_absent,
    COALESCE(
        (
            SELECT pg_has_role(current_user, capability_role.oid, 'MEMBER')
            FROM pg_roles AS capability_role
            WHERE capability_role.rolname = 'fsl_api_runtime'
        ),
        FALSE
    ) AS is_api_runtime_member,
    COALESCE(
        (
            SELECT pg_has_role(current_user, capability_role.oid, 'MEMBER')
            FROM pg_roles AS capability_role
            WHERE capability_role.rolname = 'fsl_admin_runtime'
        ),
        FALSE
    ) AS is_admin_runtime_member,
    COALESCE(
        (
            SELECT pg_has_role(current_user, capability_role.oid, 'MEMBER')
            FROM pg_roles AS capability_role
            WHERE capability_role.rolname = 'fsl_worker_runtime'
        ),
        FALSE
    ) AS is_worker_runtime_member,
    COALESCE(
        (
            SELECT pg_has_role(current_user, migration_role.oid, 'MEMBER')
            FROM pg_roles AS migration_role
            WHERE migration_role.rolname = 'fsl_migration'
        ),
        TRUE
    ) AS is_migration_member,
    COALESCE(
        (
            SELECT pg_has_role(current_user, backup_role.oid, 'MEMBER')
            FROM pg_roles AS backup_role
            WHERE backup_role.rolname = 'fsl_backup_restore'
        ),
        TRUE
    ) AS is_backup_member,
    has_table_privilege(current_user, 'public.library_members', 'SELECT') AS members_select,
    has_table_privilege(current_user, 'public.library_members', 'INSERT') AS members_insert,
    has_table_privilege(current_user, 'public.library_members', 'UPDATE') AS members_update,
    has_table_privilege(current_user, 'public.library_members', 'DELETE') AS members_delete,
    has_table_privilege(current_user, 'public.library_identities', 'SELECT') AS identities_select,
    has_table_privilege(current_user, 'public.library_identities', 'INSERT') AS identities_insert,
    has_table_privilege(current_user, 'public.library_identities', 'UPDATE') AS identities_update,
    has_table_privilege(current_user, 'public.library_identities', 'DELETE') AS identities_delete,
    has_table_privilege(current_user, 'public.library_applications', 'SELECT') AS applications_select,
    has_table_privilege(current_user, 'public.library_applications', 'INSERT') AS applications_insert,
    has_table_privilege(current_user, 'public.library_applications', 'UPDATE') AS applications_update,
    has_table_privilege(current_user, 'public.library_applications', 'DELETE') AS applications_delete,
    has_table_privilege(current_user, 'public.library_access_grants', 'SELECT') AS grants_select,
    has_table_privilege(current_user, 'public.library_access_grants', 'INSERT') AS grants_insert,
    has_table_privilege(current_user, 'public.library_access_grants', 'UPDATE') AS grants_update,
    has_table_privilege(current_user, 'public.library_access_grants', 'DELETE') AS grants_delete,
    has_table_privilege(current_user, 'public.library_operations', 'SELECT') AS operations_select,
    has_table_privilege(current_user, 'public.library_operations', 'INSERT') AS operations_insert,
    has_table_privilege(current_user, 'public.library_operations', 'UPDATE') AS operations_update,
    has_table_privilege(current_user, 'public.library_operations', 'DELETE') AS operations_delete,
    has_table_privilege(current_user, 'public.library_resource_leases', 'SELECT') AS leases_select,
    has_table_privilege(current_user, 'public.library_resource_leases', 'INSERT') AS leases_insert,
    has_table_privilege(current_user, 'public.library_resource_leases', 'UPDATE') AS leases_update,
    has_table_privilege(current_user, 'public.library_resource_leases', 'DELETE') AS leases_delete,
    has_table_privilege(current_user, 'public.library_admins', 'SELECT') AS admins_select,
    has_table_privilege(current_user, 'public.library_admins', 'INSERT') AS admins_insert,
    has_table_privilege(current_user, 'public.library_admins', 'UPDATE') AS admins_update,
    has_table_privilege(current_user, 'public.library_admins', 'DELETE') AS admins_delete,
    has_table_privilege(current_user, 'public.library_admin_audit', 'SELECT') AS audit_select,
    has_table_privilege(current_user, 'public.library_admin_audit', 'INSERT') AS audit_insert,
    has_table_privilege(current_user, 'public.library_admin_audit', 'UPDATE') AS audit_update,
    has_table_privilege(current_user, 'public.library_admin_audit', 'DELETE') AS audit_delete,
    has_table_privilege(current_user, 'public.library_export_runs', 'SELECT') AS exports_select,
    has_table_privilege(current_user, 'public.library_export_runs', 'INSERT') AS exports_insert,
    has_table_privilege(current_user, 'public.library_export_runs', 'UPDATE') AS exports_update,
    has_table_privilege(current_user, 'public.library_export_runs', 'DELETE') AS exports_delete,
    has_table_privilege(current_user, 'public.library_import_batches', 'SELECT') AS import_batches_select,
    has_table_privilege(current_user, 'public.library_import_batches', 'INSERT') AS import_batches_insert,
    has_table_privilege(current_user, 'public.library_import_batches', 'UPDATE') AS import_batches_update,
    has_table_privilege(current_user, 'public.library_import_batches', 'DELETE') AS import_batches_delete,
    has_table_privilege(current_user, 'public.library_import_rows', 'SELECT') AS import_rows_select,
    has_table_privilege(current_user, 'public.library_import_rows', 'INSERT') AS import_rows_insert,
    has_table_privilege(current_user, 'public.library_import_rows', 'UPDATE') AS import_rows_update,
    has_table_privilege(current_user, 'public.library_import_rows', 'DELETE') AS import_rows_delete,
    has_table_privilege(current_user, 'public.alembic_version', 'SELECT') AS alembic_select
FROM pg_roles AS role
WHERE role.rolname = current_user
"""


_COMMON_FORBIDDEN = {
    "is_superuser",
    "can_create_role",
    "can_create_database",
    "can_replicate",
    "can_bypass_rls",
    "is_database_owner",
    "has_unexpected_role_membership",
    "can_create_schema_objects",
    "public_api_schema_create",
    "private_schema_usage",
    "private_rpc_keys_select",
    "is_migration_member",
    "is_backup_member",
    "members_delete",
    "identities_delete",
    "applications_delete",
    "grants_delete",
    "operations_delete",
    "leases_delete",
    "admins_insert",
    "admins_update",
    "admins_delete",
    "audit_update",
    "audit_delete",
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
}

_REQUIRED_BY_SURFACE = {
    "public": {
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
    },
    "admin": {
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
    },
    "worker": {
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
    },
}

_EXTRA_FORBIDDEN_BY_SURFACE = {
    "public": {
        "is_admin_runtime_member",
        "is_worker_runtime_member",
        "members_select",
        "members_insert",
        "members_update",
        "identities_select",
        "identities_insert",
        "identities_update",
        "applications_select",
        "applications_insert",
        "applications_update",
        "grants_select",
        "grants_insert",
        "grants_update",
        "operations_select",
        "operations_insert",
        "operations_update",
        "leases_select",
        "leases_insert",
        "leases_update",
        "admins_select",
        "audit_select",
        "audit_insert",
        "exports_select",
        "exports_insert",
    },
    "admin": {
        "is_api_runtime_member",
        "is_worker_runtime_member",
        "members_insert",
        "identities_insert",
        "identities_update",
        "applications_insert",
        "leases_select",
        "leases_insert",
        "leases_update",
        "public_api_schema_usage",
        "submit_registration_rpc_execute",
        "registration_status_rpc_execute",
        "enqueue_manual_review_notification_rpc_execute",
    },
    "worker": {
        "is_api_runtime_member",
        "is_admin_runtime_member",
        "members_insert",
        "members_update",
        "identities_insert",
        "identities_update",
        "applications_insert",
        "applications_update",
        "grants_insert",
        "operations_insert",
        "admins_select",
        "audit_select",
        "audit_insert",
        "exports_select",
        "exports_insert",
        "public_api_schema_usage",
        "submit_registration_rpc_execute",
        "registration_status_rpc_execute",
        "enqueue_manual_review_notification_rpc_execute",
    },
}


def validate_runtime_database_capabilities(
    capabilities: Mapping[str, object],
    *,
    surface: str,
    expected_role: str,
) -> None:
    if surface not in _REQUIRED_BY_SURFACE:
        raise RuntimeDatabaseBoundaryError("unsupported_runtime_surface")
    if capabilities.get("current_role") != expected_role:
        raise RuntimeDatabaseBoundaryError("unexpected_runtime_database_role")

    required = _REQUIRED_BY_SURFACE[surface]
    missing = sorted(key for key in required if capabilities.get(key) is not True)
    forbidden = _COMMON_FORBIDDEN | _EXTRA_FORBIDDEN_BY_SURFACE[surface]
    excessive = sorted(key for key in forbidden if capabilities.get(key) is True)
    if missing or excessive:
        raise RuntimeDatabaseBoundaryError("runtime_database_privilege_mismatch")


def verify_runtime_database_boundary(
    session: Session,
    *,
    surface: str,
    expected_role: str,
    rpc_key_version: str | None = None,
    rpc_token: str | None = None,
) -> None:
    row = session.execute(text(_CAPABILITY_SQL)).mappings().one()
    validate_runtime_database_capabilities(
        row,
        surface=surface,
        expected_role=expected_role,
    )
    if surface == "public":
        if not rpc_key_version or not rpc_token:
            raise RuntimeDatabaseBoundaryError(
                "runtime_database_rpc_capability_missing"
            )
        try:
            session.execute(
                text(
                    "SELECT * FROM "
                    "fsl_public_api.registration_status_v1("
                    "CAST('00000000-0000-0000-0000-000000000000' AS uuid), "
                    ":subject_hash, :rpc_key_version, :rpc_token)"
                ),
                {
                    "subject_hash": "0" * 64,
                    "rpc_key_version": rpc_key_version,
                    "rpc_token": rpc_token,
                },
            ).all()
        except Exception as error:
            session.rollback()
            raise RuntimeDatabaseBoundaryError(
                "runtime_database_rpc_capability_invalid"
            ) from error
