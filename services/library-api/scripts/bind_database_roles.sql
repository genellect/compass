\set ON_ERROR_STOP on
\if :{?api_runtime_login}
\else
  \echo 'api_runtime_login psql variable is required'
  SELECT 1 / 0 AS database_role_binding_failed;
\endif
\if :{?worker_runtime_login}
\else
  \echo 'worker_runtime_login psql variable is required'
  SELECT 1 / 0 AS database_role_binding_failed;
\endif
\if :{?migration_login}
\else
  \echo 'migration_login psql variable is required'
  SELECT 1 / 0 AS database_role_binding_failed;
\endif
\if :{?backup_restore_login}
\else
  \echo 'backup_restore_login psql variable is required'
  SELECT 1 / 0 AS database_role_binding_failed;
\endif

-- Identifier interpolation quotes values safely. Pass role names only, never
-- passwords: pass role names with -v; credential values remain environment-only.
GRANT fsl_api_runtime TO :"api_runtime_login";
\if :{?admin_runtime_login}
GRANT fsl_admin_runtime TO :"admin_runtime_login";
\endif
GRANT fsl_worker_runtime TO :"worker_runtime_login";
GRANT fsl_migration TO :"migration_login";
GRANT fsl_backup_restore TO :"backup_restore_login";
