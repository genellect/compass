\set ON_ERROR_STOP on

-- Run through the dedicated migration login after Alembic upgrade. Force the
-- same capability role Alembic uses so grants are issued by the object owner.
-- A missing role binding fails before any privilege is changed.
SET ROLE fsl_migration;
SELECT current_user = 'fsl_migration' AS migration_role_active
\gset
\if :migration_role_active
\else
  \echo 'FAIL: fsl_migration capability role is not active'
  SELECT 1 / 0 AS database_role_grant_failed;
\endif

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO fsl_backup_restore;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO fsl_backup_restore;
ALTER DEFAULT PRIVILEGES IN SCHEMA fsl_public_api
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fsl_private
    REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fsl_worker_api
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- New runtime tables are omitted by default and require an explicit review
-- before this list is extended.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM fsl_api_runtime, fsl_admin_runtime, fsl_worker_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM fsl_api_runtime, fsl_admin_runtime, fsl_worker_runtime;

-- Public runtime is execute-only for application data. Re-running this file
-- also removes any legacy or accidental raw grants before exact RPC grants.
GRANT SELECT ON TABLE public.alembic_version TO fsl_api_runtime;
REVOKE ALL ON SCHEMA fsl_public_api FROM PUBLIC;
REVOKE ALL ON SCHEMA fsl_private FROM PUBLIC;
REVOKE ALL ON SCHEMA fsl_worker_api FROM PUBLIC;
REVOKE CREATE ON SCHEMA fsl_public_api FROM
    fsl_api_runtime,
    fsl_admin_runtime,
    fsl_worker_runtime,
    fsl_backup_restore;
REVOKE CREATE ON SCHEMA fsl_worker_api FROM
    fsl_api_runtime,
    fsl_admin_runtime,
    fsl_worker_runtime,
    fsl_backup_restore;
REVOKE ALL ON SCHEMA fsl_private FROM
    fsl_api_runtime,
    fsl_admin_runtime,
    fsl_worker_runtime,
    fsl_backup_restore;
REVOKE ALL ON ALL TABLES IN SCHEMA fsl_private FROM
    PUBLIC,
    fsl_api_runtime,
    fsl_admin_runtime,
    fsl_worker_runtime,
    fsl_backup_restore;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fsl_public_api FROM
    PUBLIC,
    fsl_api_runtime,
    fsl_admin_runtime,
    fsl_worker_runtime,
    fsl_backup_restore;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fsl_worker_api FROM
    PUBLIC,
    fsl_api_runtime,
    fsl_admin_runtime,
    fsl_worker_runtime,
    fsl_backup_restore;
GRANT USAGE ON SCHEMA fsl_public_api TO fsl_api_runtime;
GRANT EXECUTE ON FUNCTION
    fsl_public_api.submit_registration_v1(jsonb, text)
TO fsl_api_runtime;
GRANT EXECUTE ON FUNCTION
    fsl_public_api.registration_status_v1(uuid, text, text, text)
TO fsl_api_runtime;
GRANT EXECUTE ON FUNCTION
    fsl_public_api.enqueue_manual_review_notification_v1(
        uuid,
        text,
        uuid,
        text,
        text
    )
TO fsl_api_runtime;
GRANT USAGE ON SCHEMA fsl_worker_api TO fsl_worker_runtime;
GRANT EXECUTE ON FUNCTION fsl_worker_api.lock_member_v1(uuid)
TO fsl_worker_runtime;

GRANT SELECT, UPDATE ON TABLE public.library_members TO fsl_admin_runtime;
GRANT SELECT ON TABLE public.library_identities TO fsl_admin_runtime;
GRANT SELECT, UPDATE ON TABLE public.library_applications TO fsl_admin_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE
    public.library_access_grants,
    public.library_operations
TO fsl_admin_runtime;
GRANT SELECT ON TABLE public.library_admins TO fsl_admin_runtime;
GRANT SELECT, INSERT ON TABLE public.library_admin_audit TO fsl_admin_runtime;
-- Phase 10A writes immutable export metadata only. The response bytes are
-- streamed from memory and are never stored in PostgreSQL.
GRANT SELECT, INSERT ON TABLE public.library_export_runs TO fsl_admin_runtime;
GRANT SELECT ON TABLE public.alembic_version TO fsl_admin_runtime;

GRANT SELECT ON TABLE
    public.library_members,
    public.library_identities,
    public.library_applications
TO fsl_worker_runtime;
GRANT SELECT, UPDATE ON TABLE
    public.library_access_grants,
    public.library_operations
TO fsl_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE
    public.library_notification_outbox
TO fsl_worker_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.library_resource_leases TO fsl_worker_runtime;
GRANT SELECT ON TABLE public.alembic_version TO fsl_worker_runtime;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO fsl_backup_restore;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fsl_backup_restore;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON ALL TABLES IN SCHEMA public FROM fsl_backup_restore;
REVOKE CREATE ON SCHEMA public FROM fsl_api_runtime, fsl_admin_runtime, fsl_worker_runtime, fsl_backup_restore;

RESET ROLE;
