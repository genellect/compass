\set ON_ERROR_STOP on

-- Machine-failing least-privilege audit. Run as an owner/auditor after role
-- binding and grant_database_privileges.sql.
SELECT count(*) = 5 AS roles_are_restricted
FROM pg_roles
WHERE rolname IN ('fsl_api_runtime', 'fsl_admin_runtime', 'fsl_worker_runtime', 'fsl_migration', 'fsl_backup_restore')
  AND NOT rolsuper
  AND NOT rolcreatedb
  AND NOT rolcreaterole
  AND NOT rolreplication
  AND NOT rolbypassrls
  AND NOT rolinherit
  AND NOT rolcanlogin
\gset
\if :roles_are_restricted
\else
  \echo 'FAIL: capability roles are missing or over-privileged'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT has_database_privilege(
           'fsl_migration', current_database(), 'CREATE'
       )
   AND NOT has_database_privilege(
           'fsl_api_runtime', current_database(), 'CREATE'
       )
   AND NOT has_database_privilege(
           'fsl_admin_runtime', current_database(), 'CREATE'
       )
   AND NOT has_database_privilege(
           'fsl_worker_runtime', current_database(), 'CREATE'
       )
   AND NOT has_database_privilege(
           'fsl_backup_restore', current_database(), 'CREATE'
       ) AS database_create_boundary_valid
\gset
\if :database_create_boundary_valid
\else
  \echo 'FAIL: database CREATE boundary is invalid'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT n.nspowner = migration.oid
   AND NOT EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS acl
       WHERE acl.grantee = 0
         AND acl.privilege_type = 'CREATE'
   )
   AND NOT has_schema_privilege('fsl_api_runtime', 'public', 'CREATE')
   AND NOT has_schema_privilege('fsl_admin_runtime', 'public', 'CREATE')
   AND NOT has_schema_privilege('fsl_worker_runtime', 'public', 'CREATE')
   AND NOT has_schema_privilege('fsl_backup_restore', 'public', 'CREATE')
   AND has_schema_privilege('fsl_migration', 'public', 'CREATE')
   AS schema_boundary_valid
FROM pg_namespace AS n
JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
WHERE n.nspname = 'public'
\gset
\if :schema_boundary_valid
\else
  \echo 'FAIL: schema CREATE boundary is invalid'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT n.nspowner = migration.oid
   AND NOT EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS acl
       WHERE acl.grantee = 0
   )
   AND has_schema_privilege('fsl_api_runtime', 'fsl_public_api', 'USAGE')
   AND NOT has_schema_privilege('fsl_api_runtime', 'fsl_public_api', 'CREATE')
   AND NOT has_schema_privilege('fsl_admin_runtime', 'fsl_public_api', 'USAGE')
   AND NOT has_schema_privilege('fsl_worker_runtime', 'fsl_public_api', 'USAGE')
   AND NOT has_schema_privilege('fsl_backup_restore', 'fsl_public_api', 'USAGE')
   AS public_api_schema_boundary_valid
FROM pg_namespace AS n
JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
WHERE n.nspname = 'fsl_public_api'
\gset
\if :public_api_schema_boundary_valid
\else
  \echo 'FAIL: public API capability schema boundary is invalid'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT n.nspowner = migration.oid
   AND NOT EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS acl
       WHERE acl.grantee = 0
   )
   AND has_schema_privilege('fsl_worker_runtime', 'fsl_worker_api', 'USAGE')
   AND NOT has_schema_privilege('fsl_worker_runtime', 'fsl_worker_api', 'CREATE')
   AND NOT has_schema_privilege('fsl_api_runtime', 'fsl_worker_api', 'USAGE')
   AND NOT has_schema_privilege('fsl_admin_runtime', 'fsl_worker_api', 'USAGE')
   AND NOT has_schema_privilege('fsl_backup_restore', 'fsl_worker_api', 'USAGE')
   AS worker_api_schema_boundary_valid
FROM pg_namespace AS n
JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
WHERE n.nspname = 'fsl_worker_api'
\gset
\if :worker_api_schema_boundary_valid
\else
  \echo 'FAIL: worker capability schema boundary is invalid'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT n.nspowner = migration.oid
   AND NOT EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS acl
       WHERE acl.grantee = 0
          OR acl.grantee IN (
              SELECT oid
              FROM pg_roles
              WHERE rolname IN (
                  'fsl_api_runtime',
                  'fsl_admin_runtime',
                  'fsl_worker_runtime',
                  'fsl_backup_restore'
              )
          )
   )
   AND key_table.relowner = migration.oid
   AND NOT has_table_privilege(
       'fsl_api_runtime',
       'fsl_private.public_registration_rpc_keys',
       'SELECT'
   )
   AND NOT has_table_privilege(
       'fsl_admin_runtime',
       'fsl_private.public_registration_rpc_keys',
       'SELECT'
   )
   AND NOT has_table_privilege(
       'fsl_worker_runtime',
       'fsl_private.public_registration_rpc_keys',
       'SELECT'
   )
   AND NOT has_table_privilege(
       'fsl_backup_restore',
       'fsl_private.public_registration_rpc_keys',
       'SELECT'
   )
   AND EXISTS (
       SELECT 1
       FROM fsl_private.public_registration_rpc_keys AS key
       WHERE key.active
         AND pg_catalog.octet_length(key.token_sha256) = 32
   ) AS private_rpc_key_boundary_valid
FROM pg_namespace AS n
JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
JOIN pg_class AS key_table
  ON key_table.relnamespace = n.oid
 AND key_table.relname = 'public_registration_rpc_keys'
 AND key_table.relkind IN ('r', 'p')
WHERE n.nspname = 'fsl_private'
\gset
\if :private_rpc_key_boundary_valid
\else
  \echo 'FAIL: private public-RPC key boundary is invalid or unprovisioned'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

WITH expected(table_name) AS (
    VALUES
        ('alembic_version'),
        ('library_access_grants'),
        ('library_admin_audit'),
        ('library_admins'),
        ('library_applications'),
        ('library_export_runs'),
        ('library_identities'),
        ('library_import_batches'),
        ('library_import_rows'),
        ('library_members'),
        ('library_operations'),
        ('library_resource_leases')
), migration AS (
    SELECT oid FROM pg_roles WHERE rolname = 'fsl_migration'
)
SELECT bool_and(c.oid IS NOT NULL AND c.relowner = migration.oid)
   AND NOT EXISTS (
       SELECT 1
       FROM pg_class AS application_object
       JOIN pg_namespace AS application_schema
         ON application_schema.oid = application_object.relnamespace
       WHERE application_schema.nspname = 'public'
         AND application_object.relkind IN ('r', 'p')
         AND (
             application_object.relname = 'alembic_version'
             OR left(application_object.relname, 8) = 'library_'
         )
         AND application_object.relowner <> (
             SELECT oid FROM pg_roles WHERE rolname = 'fsl_migration'
         )
   ) AS application_tables_owned
FROM expected
CROSS JOIN migration
LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_class AS c
  ON c.relnamespace = n.oid
 AND c.relname = expected.table_name
 AND c.relkind IN ('r', 'p')
\gset
\if :application_tables_owned
\else
  \echo 'FAIL: application tables are missing or not owned by fsl_migration'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND (c.relname = 'alembic_version' OR left(c.relname, 8) = 'library_')
      AND c.relowner <> migration.oid
) AS application_sequences_owned
\gset
\if :application_sequences_owned
\else
  \echo 'FAIL: an application sequence is not owned by fsl_migration'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
    WHERE n.nspname = 'public'
      AND left(p.proname, 13) = 'deny_library_'
      AND p.proowner <> migration.oid
) AS application_functions_owned
\gset
\if :application_functions_owned
\else
  \echo 'FAIL: an application function is not owned by fsl_migration'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT count(*) = 3
   AND bool_and(
       p.prosecdef
       AND NOT p.proleakproof
       AND migration.oid = p.proowner
       AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
       AND position('EXECUTE ' IN upper(p.prosrc)) = 0
       AND NOT EXISTS (
           SELECT 1
           FROM aclexplode(
               COALESCE(p.proacl, acldefault('f', p.proowner))
           ) AS acl
           WHERE acl.grantee = 0
             AND acl.privilege_type = 'EXECUTE'
       )
       AND (
           p.proname = 'submit_registration_v1'
           AND p.provolatile = 'v'
           AND pg_get_function_identity_arguments(p.oid) =
               'p_request jsonb, p_rpc_token text'
           OR p.proname = 'registration_status_v1'
           AND p.provolatile = 's'
           AND pg_get_function_identity_arguments(p.oid) =
               'p_application_id uuid, p_authentication_subject_hash text, p_rpc_key_version text, p_rpc_token text'
           OR p.proname = 'enqueue_manual_review_notification_v1'
           AND p.provolatile = 'v'
           AND pg_get_function_identity_arguments(p.oid) =
               'p_application_id uuid, p_authentication_subject_hash text, p_candidate_notification_id uuid, p_rpc_key_version text, p_rpc_token text'
       )
   ) AS public_api_functions_hardened
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_roles AS migration ON migration.rolname = 'fsl_migration'
WHERE n.nspname = 'fsl_public_api'
\gset
\if :public_api_functions_hardened
\else
  \echo 'FAIL: public API functions are missing or unsafe'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT has_function_privilege(
           'fsl_api_runtime',
           'fsl_public_api.submit_registration_v1(jsonb,text)',
           'EXECUTE'
       )
   AND has_function_privilege(
           'fsl_api_runtime',
           'fsl_public_api.registration_status_v1(uuid,text,text,text)',
           'EXECUTE'
       )
   AND has_function_privilege(
           'fsl_api_runtime',
           'fsl_public_api.enqueue_manual_review_notification_v1(uuid,text,uuid,text,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_admin_runtime',
           'fsl_public_api.submit_registration_v1(jsonb,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_admin_runtime',
           'fsl_public_api.registration_status_v1(uuid,text,text,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_admin_runtime',
           'fsl_public_api.enqueue_manual_review_notification_v1(uuid,text,uuid,text,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_worker_runtime',
           'fsl_public_api.submit_registration_v1(jsonb,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_worker_runtime',
           'fsl_public_api.registration_status_v1(uuid,text,text,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_worker_runtime',
           'fsl_public_api.enqueue_manual_review_notification_v1(uuid,text,uuid,text,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_backup_restore',
           'fsl_public_api.submit_registration_v1(jsonb,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_backup_restore',
           'fsl_public_api.registration_status_v1(uuid,text,text,text)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_backup_restore',
           'fsl_public_api.enqueue_manual_review_notification_v1(uuid,text,uuid,text,text)',
           'EXECUTE'
       ) AS public_api_exact_execute_boundary
\gset
\if :public_api_exact_execute_boundary
\else
  \echo 'FAIL: public API function EXECUTE boundary is invalid'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT has_function_privilege(
           'fsl_worker_runtime',
           'fsl_worker_api.lock_member_v1(uuid)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_api_runtime',
           'fsl_worker_api.lock_member_v1(uuid)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_admin_runtime',
           'fsl_worker_api.lock_member_v1(uuid)',
           'EXECUTE'
       )
   AND NOT has_function_privilege(
           'fsl_backup_restore',
           'fsl_worker_api.lock_member_v1(uuid)',
           'EXECUTE'
       ) AS worker_api_exact_execute_boundary
\gset
\if :worker_api_exact_execute_boundary
\else
  \echo 'FAIL: worker lock function EXECUTE boundary is invalid'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT has_table_privilege(
           'fsl_api_runtime',
           'public.alembic_version',
           'SELECT'
       ) AS api_required_grants
\gset
\if :api_required_grants
\else
  \echo 'FAIL: API runtime role is missing an application privilege'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND left(c.relname, 8) = 'library_'
      AND c.relkind IN ('r', 'p')
      AND (
          has_table_privilege('fsl_api_runtime', c.oid, 'SELECT')
          OR has_table_privilege('fsl_api_runtime', c.oid, 'INSERT')
          OR has_table_privilege('fsl_api_runtime', c.oid, 'UPDATE')
          OR has_table_privilege('fsl_api_runtime', c.oid, 'DELETE')
          OR has_table_privilege('fsl_api_runtime', c.oid, 'TRUNCATE')
          OR has_table_privilege('fsl_api_runtime', c.oid, 'REFERENCES')
          OR has_table_privilege('fsl_api_runtime', c.oid, 'TRIGGER')
          OR EXISTS (
              SELECT 1
              FROM pg_attribute AS a
              WHERE a.attrelid = c.oid
                AND a.attnum > 0
                AND NOT a.attisdropped
                AND (
                    has_column_privilege(
                        'fsl_api_runtime', c.oid, a.attnum, 'SELECT'
                    )
                    OR has_column_privilege(
                        'fsl_api_runtime', c.oid, a.attnum, 'INSERT'
                    )
                    OR has_column_privilege(
                        'fsl_api_runtime', c.oid, a.attnum, 'UPDATE'
                    )
                    OR has_column_privilege(
                        'fsl_api_runtime', c.oid, a.attnum, 'REFERENCES'
                    )
                )
          )
      )
) AS api_raw_table_grants_absent
\gset
\if :api_raw_table_grants_absent
\else
  \echo 'FAIL: API runtime retains a raw library table or column grant'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND left(c.relname, 8) = 'library_'
      AND c.relkind = 'S'
      AND (
          has_sequence_privilege('fsl_api_runtime', c.oid, 'USAGE')
          OR has_sequence_privilege('fsl_api_runtime', c.oid, 'SELECT')
          OR has_sequence_privilege('fsl_api_runtime', c.oid, 'UPDATE')
      )
) AS api_raw_sequence_grants_absent
\gset
\if :api_raw_sequence_grants_absent
\else
  \echo 'FAIL: API runtime retains a raw library sequence grant'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT bool_and(has_table_privilege('fsl_admin_runtime', table_name, privilege))
       AS admin_required_grants
FROM (VALUES
    ('public.library_members', 'SELECT'),
    ('public.library_members', 'UPDATE'),
    ('public.library_identities', 'SELECT'),
    ('public.library_applications', 'SELECT'),
    ('public.library_applications', 'UPDATE'),
    ('public.library_access_grants', 'SELECT'),
    ('public.library_access_grants', 'INSERT'),
    ('public.library_access_grants', 'UPDATE'),
    ('public.library_operations', 'SELECT'),
    ('public.library_operations', 'INSERT'),
    ('public.library_operations', 'UPDATE'),
    ('public.library_admins', 'SELECT'),
    ('public.library_admin_audit', 'SELECT'),
    ('public.library_admin_audit', 'INSERT'),
    ('public.library_export_runs', 'SELECT'),
    ('public.library_export_runs', 'INSERT'),
    ('public.alembic_version', 'SELECT')
) AS required(table_name, privilege)
\gset
\if :admin_required_grants
\else
  \echo 'FAIL: admin runtime role is missing a management privilege'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT bool_and(has_table_privilege('fsl_worker_runtime', table_name, privilege))
       AS worker_required_grants
FROM (VALUES
    ('public.library_members', 'SELECT'),
    ('public.library_identities', 'SELECT'),
    ('public.library_applications', 'SELECT'),
    ('public.library_access_grants', 'SELECT'),
    ('public.library_access_grants', 'UPDATE'),
    ('public.library_operations', 'SELECT'),
    ('public.library_operations', 'UPDATE'),
    ('public.library_notification_outbox', 'SELECT'),
    ('public.library_notification_outbox', 'INSERT'),
    ('public.library_notification_outbox', 'UPDATE'),
    ('public.library_resource_leases', 'SELECT'),
    ('public.library_resource_leases', 'INSERT'),
    ('public.library_resource_leases', 'UPDATE'),
    ('public.alembic_version', 'SELECT')
) AS required(table_name, privilege)
\gset
\if :worker_required_grants
\else
  \echo 'FAIL: worker runtime role is missing a processing privilege'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

SELECT NOT has_table_privilege('fsl_api_runtime', 'public.library_admins', 'SELECT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_admin_audit', 'SELECT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_admin_audit', 'INSERT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_export_runs', 'SELECT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_export_runs', 'INSERT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_import_batches', 'SELECT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_import_rows', 'SELECT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_resource_leases', 'SELECT')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_members', 'UPDATE')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_applications', 'UPDATE')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_access_grants', 'UPDATE')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.library_operations', 'UPDATE')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_members', 'INSERT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_identities', 'INSERT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_identities', 'UPDATE')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_applications', 'INSERT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_admins', 'INSERT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_admins', 'UPDATE')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_admin_audit', 'UPDATE')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_export_runs', 'UPDATE')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_import_batches', 'SELECT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_import_rows', 'SELECT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_resource_leases', 'SELECT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_notification_outbox', 'SELECT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_notification_outbox', 'INSERT')
   AND NOT has_table_privilege('fsl_admin_runtime', 'public.library_notification_outbox', 'UPDATE')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_admins', 'SELECT')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_admin_audit', 'SELECT')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_export_runs', 'SELECT')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_operations', 'INSERT')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_members', 'UPDATE')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_access_grants', 'INSERT')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.library_notification_outbox', 'DELETE')
   AND NOT has_table_privilege('fsl_api_runtime', 'public.alembic_version', 'UPDATE')
   AND NOT has_table_privilege('fsl_worker_runtime', 'public.alembic_version', 'UPDATE')
   AND NOT has_table_privilege('fsl_backup_restore', 'public.library_members', 'INSERT')
   AND NOT has_table_privilege('fsl_backup_restore', 'public.library_members', 'UPDATE')
   AND NOT has_table_privilege('fsl_backup_restore', 'public.library_members', 'DELETE')
   AS forbidden_grants_absent
\gset
\if :forbidden_grants_absent
\else
  \echo 'FAIL: API, admin, worker, or backup role has a forbidden privilege'
  SELECT 1 / 0 AS database_role_audit_failed;
\endif

\echo 'database_role_audit=pass'
