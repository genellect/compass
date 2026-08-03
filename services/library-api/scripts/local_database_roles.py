"""Fail-closed local PostgreSQL role bootstrap for synthetic Docker gates.

Production migrations always use the separately provisioned migration login.
This helper exists only because local Compose and temporary evidence databases
are created dynamically and must establish the same NOLOGIN ownership boundary
before Alembic executes. It refuses every non-local host and known non-synthetic
database name.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess

from sqlalchemy.engine import make_url

from app.db.session import normalize_database_url


SCRIPT_ROOT = Path(__file__).resolve().parent
PRIMARY_DATABASE = "compass_library_dev"
TEMPORARY_DATABASE_PREFIX = "fsl_phase10a_evidence_"
LOCAL_HOSTS = {"db", "127.0.0.1", "localhost"}


def _connection_details(database_url: str) -> tuple[dict[str, str], str]:
    normalized = normalize_database_url(database_url.strip())
    if not normalized:
        raise RuntimeError("A local synthetic PostgreSQL URL is required.")
    parsed = make_url(normalized)
    host = (parsed.host or "").lower()
    database = parsed.database or ""
    username = parsed.username or ""
    password = parsed.password or ""
    if parsed.get_backend_name() != "postgresql" or host not in LOCAL_HOSTS:
        raise RuntimeError("A local synthetic PostgreSQL URL is required.")
    if database != PRIMARY_DATABASE and not database.startswith(
        TEMPORARY_DATABASE_PREFIX
    ):
        raise RuntimeError("The local database name is outside the synthetic gate.")
    if not username or not password:
        raise RuntimeError("The local synthetic database login is incomplete.")

    query = {str(key).lower(): str(value) for key, value in parsed.query.items()}
    environment = os.environ.copy()
    environment.update(
        {
            "PGHOST": host,
            "PGPORT": str(parsed.port or 5432),
            "PGDATABASE": database,
            "PGUSER": username,
            "PGPASSWORD": password,
            "PGSSLMODE": query.get("sslmode", "disable"),
            "PGCONNECT_TIMEOUT": "5",
        }
    )
    return environment, username


def _run_psql(
    database_url: str,
    script_name: str,
    *,
    variables: dict[str, str] | None = None,
) -> None:
    psql = shutil.which("psql")
    if psql is None:
        raise RuntimeError("psql is required for the local database role gate.")
    script_path = SCRIPT_ROOT / script_name
    if not script_path.is_file():
        raise RuntimeError(f"Local role script is missing: {script_name}")

    environment, _ = _connection_details(database_url)
    command = [psql, "--no-psqlrc", "--file", str(script_path)]
    for name, value in sorted((variables or {}).items()):
        command.extend(("--set", f"{name}={value}"))
    completed = subprocess.run(
        command,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if completed.returncode != 0:
        # Never include stdout/stderr: connection and catalog errors can contain
        # operator-controlled identifiers. The script name is sufficient evidence.
        raise RuntimeError(f"Local database role script failed: {script_name}")


def bootstrap_and_bind_local_database(database_url: str) -> None:
    _, username = _connection_details(database_url)
    _run_psql(database_url, "bootstrap_database_roles.sql")
    _run_psql(
        database_url,
        "bind_database_roles.sql",
        variables={
            "api_runtime_login": username,
            "admin_runtime_login": username,
            "worker_runtime_login": username,
            "migration_login": username,
            "backup_restore_login": username,
        },
    )


def grant_and_audit_local_database(database_url: str) -> None:
    from app.config import Settings
    from scripts.provision_public_rpc_key import provision_public_rpc_key

    provision_public_rpc_key(
        Settings(
            database_url=database_url,
            database_url_unpooled=database_url,
            public_registration_rpc_key_version=os.environ.get(
                "PUBLIC_REGISTRATION_RPC_KEY_VERSION",
                "v1",
            ),
            public_registration_rpc_token=os.environ.get(
                "PUBLIC_REGISTRATION_RPC_TOKEN",
                "local-synthetic-public-rpc-token-v1-000000",
            ),
        )
    )
    _run_psql(database_url, "grant_database_privileges.sql")
    _run_psql(database_url, "audit_database_roles.sql")


def _assert_synthetic_environment() -> str:
    if os.environ.get("FSL_DATA_CLASSIFICATION") != "synthetic-only":
        raise RuntimeError("FSL_DATA_CLASSIFICATION=synthetic-only is required.")
    for name, expected in {
        "EXTERNAL_SIDE_EFFECTS_ENABLED": "false",
        "PHASE7_DRIVE_API_ENABLED": "false",
        "PHASE7_DRIVE_KILL_SWITCH": "true",
    }.items():
        if os.environ.get(name, "").lower() != expected:
            raise RuntimeError(f"{name} must be {expected}.")
    database_url = os.environ.get("DATABASE_URL_UNPOOLED", "").strip()
    _connection_details(database_url)
    return database_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Local synthetic DB role gate")
    parser.add_argument(
        "action",
        choices=("bootstrap-bind", "grant-audit"),
    )
    action = parser.parse_args().action
    database_url = _assert_synthetic_environment()
    if action == "bootstrap-bind":
        bootstrap_and_bind_local_database(database_url)
    else:
        grant_and_audit_local_database(database_url)
    print(f"local_database_roles={action}:pass")


if __name__ == "__main__":
    main()
