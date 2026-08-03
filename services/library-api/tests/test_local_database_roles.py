from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts.local_database_roles import (
    _connection_details,
    bootstrap_and_bind_local_database,
    grant_and_audit_local_database,
)


LOCAL_URL = (
    "postgresql+psycopg://compass_library_dev:synthetic@db:5432/"
    "compass_library_dev"
)


def test_local_role_helper_refuses_remote_or_unapproved_database() -> None:
    with pytest.raises(RuntimeError, match="local synthetic"):
        _connection_details("")
    with pytest.raises(RuntimeError, match="local synthetic"):
        _connection_details(
            "postgresql+psycopg://u:p@ep-production.example/neondb"
        )
    with pytest.raises(RuntimeError, match="outside the synthetic gate"):
        _connection_details(
            "postgresql+psycopg://u:p@127.0.0.1/production"
        )


def test_local_role_helper_runs_bootstrap_bind_grant_and_audit_without_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[list[str], dict[str, str]]] = []
    provisioned: list[str] = []

    monkeypatch.setattr("scripts.local_database_roles.shutil.which", lambda _: "psql")

    def fake_run(command, *, env, **kwargs):
        calls.append((command, env))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("scripts.local_database_roles.subprocess.run", fake_run)
    monkeypatch.setattr(
        "scripts.provision_public_rpc_key.provision_public_rpc_key",
        lambda settings: provisioned.append(settings.database_url_unpooled),
    )

    bootstrap_and_bind_local_database(LOCAL_URL)
    grant_and_audit_local_database(LOCAL_URL)

    assert [Path(call[0][3]).name for call in calls] == [
        "bootstrap_database_roles.sql",
        "bind_database_roles.sql",
        "grant_database_privileges.sql",
        "audit_database_roles.sql",
    ]
    assert provisioned == [LOCAL_URL]
    bind_command = calls[1][0]
    assert "migration_login=compass_library_dev" in bind_command
    assert all(LOCAL_URL not in part for command, _ in calls for part in command)
    assert all(part != "synthetic" for command, _ in calls for part in command)
    assert all(environment["PGPASSWORD"] == "synthetic" for _, environment in calls)
    assert all(environment["PGHOST"] == "db" for _, environment in calls)
