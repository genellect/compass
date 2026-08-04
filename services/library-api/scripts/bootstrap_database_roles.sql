\set ON_ERROR_STOP on

-- Run once as the Neon database owner. These are NOLOGIN capability roles;
-- bind separately-created login roles with bind_database_roles.sql. No
-- password or connection string belongs in this file.
DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fsl_migration') THEN
        CREATE ROLE fsl_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fsl_api_runtime') THEN
        CREATE ROLE fsl_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fsl_admin_runtime') THEN
        CREATE ROLE fsl_admin_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fsl_worker_runtime') THEN
        CREATE ROLE fsl_worker_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fsl_backup_restore') THEN
        CREATE ROLE fsl_backup_restore NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
END
$roles$;

-- A database owner is an offline administrative principal. PostgreSQL 17
-- automatically grants the creating CREATEROLE principal membership with
-- ADMIN TRUE, SET FALSE and INHERIT FALSE. Re-granting ADMIN to that automatic
-- grant fails, while SET FALSE prevents the owner from transferring schema
-- ownership to the capability role. Preserve an existing ADMIN grant and only
-- enable SET; create the full restricted membership only when none exists.
DO $migration_admin_membership$
DECLARE
    migration_role_oid oid;
    owner_role_oid oid;
    membership_has_admin boolean;
    membership_can_set boolean;
BEGIN
    SELECT oid INTO STRICT migration_role_oid
    FROM pg_roles
    WHERE rolname = 'fsl_migration';

    SELECT oid INTO STRICT owner_role_oid
    FROM pg_roles
    WHERE rolname = current_user;

    SELECT membership.admin_option, membership.set_option
      INTO membership_has_admin, membership_can_set
    FROM pg_auth_members AS membership
    WHERE membership.roleid = migration_role_oid
      AND membership.member = owner_role_oid;

    IF NOT FOUND THEN
        EXECUTE format(
            'GRANT fsl_migration TO %I WITH ADMIN TRUE, SET TRUE, INHERIT FALSE',
            current_user
        );
    ELSIF NOT membership_has_admin THEN
        RAISE EXCEPTION 'database owner lacks ADMIN OPTION on fsl_migration';
    ELSIF NOT membership_can_set THEN
        EXECUTE format(
            'GRANT fsl_migration TO %I WITH SET TRUE',
            current_user
        );
    END IF;
END
$migration_admin_membership$;

-- Alembic activates the NOLOGIN migration capability before it creates the
-- application-owned schemas. PostgreSQL requires CREATE on the current
-- database for that operation. Keep this privilege on the migration
-- capability only; no runtime capability receives database CREATE.
DO $database_create_boundary$
BEGIN
    EXECUTE format(
        'GRANT CREATE ON DATABASE %I TO fsl_migration',
        current_database()
    );
END
$database_create_boundary$;

-- The application uses a dedicated schema ownership boundary. Runtime roles
-- receive USAGE only; only the NOLOGIN migration capability owns and can
-- create application objects in public.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO fsl_migration;
GRANT USAGE ON SCHEMA public TO fsl_api_runtime, fsl_admin_runtime, fsl_worker_runtime, fsl_backup_restore;
ALTER SCHEMA public OWNER TO fsl_migration;

-- The public API receives no table privileges. Its only database capability
-- is EXECUTE on two bounded functions in this separately-owned schema.
CREATE SCHEMA IF NOT EXISTS fsl_public_api AUTHORIZATION fsl_migration;
CREATE SCHEMA IF NOT EXISTS fsl_private AUTHORIZATION fsl_migration;
REVOKE ALL ON SCHEMA fsl_public_api FROM PUBLIC;
REVOKE ALL ON SCHEMA fsl_private FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA fsl_public_api TO fsl_migration;
GRANT USAGE, CREATE ON SCHEMA fsl_private TO fsl_migration;
ALTER SCHEMA fsl_public_api OWNER TO fsl_migration;
ALTER SCHEMA fsl_private OWNER TO fsl_migration;

-- Make the migration capability role the owner of existing application
-- objects so Alembic can alter them without a database-owner credential.
DO $ownership$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT c.relkind, n.nspname, c.relname
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE (
            (
                n.nspname = 'public'
                AND (
                    c.relname = 'alembic_version'
                    OR left(c.relname, 8) = 'library_'
                )
            ) OR (
                n.nspname = 'fsl_private'
                AND c.relname = 'public_registration_rpc_keys'
            )
        )
          AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
        ORDER BY CASE WHEN c.relkind IN ('r', 'p') THEN 0 ELSE 1 END,
                 c.relname
    LOOP
        IF item.relkind IN ('r', 'p') THEN
            EXECUTE format('ALTER TABLE %I.%I OWNER TO fsl_migration', item.nspname, item.relname);
        ELSIF item.relkind = 'S' THEN
            EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO fsl_migration', item.nspname, item.relname);
        ELSIF item.relkind = 'v' THEN
            EXECUTE format('ALTER VIEW %I.%I OWNER TO fsl_migration', item.nspname, item.relname);
        ELSIF item.relkind = 'm' THEN
            EXECUTE format('ALTER MATERIALIZED VIEW %I.%I OWNER TO fsl_migration', item.nspname, item.relname);
        END IF;
    END LOOP;
END
$ownership$;

-- PostgreSQL trigger functions are separate owned objects. Transfer the
-- application-owned functions from any earlier owner-run migration as well.
DO $function_ownership$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE (
            (
                n.nspname = 'public'
                AND left(p.proname, 13) = 'deny_library_'
            ) OR n.nspname IN ('fsl_public_api', 'fsl_private')
        )
          AND p.prokind = 'f'
    LOOP
        EXECUTE format(
            'ALTER FUNCTION %I.%I(%s) OWNER TO fsl_migration',
            item.nspname,
            item.proname,
            item.args
        );
    END LOOP;
END
$function_ownership$;
