"""Compare a synthetic source database with a restored empty branch."""

from __future__ import annotations

import json
import os
from urllib.parse import urlsplit

from sqlalchemy import create_engine, inspect, text


def _direct_url(name: str) -> str:
    value = os.environ.get(name, "").strip()
    normalized = value.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlsplit(normalized)
    local_evidence = os.environ.get("FSL_PHASE8A_LOCAL_EVIDENCE") == "confirmed"
    local_valid = (
        local_evidence
        and parsed.hostname in {"127.0.0.1", "localhost"}
        and "synthetic" in parsed.path.lower()
        and parsed.username == "postgres"
    )
    remote_direct_valid = (
        bool(parsed.hostname)
        and "-pooler." not in parsed.hostname.lower()
        and "sslmode=require" in parsed.query.lower()
    )
    if parsed.scheme != "postgresql" or not (local_valid or remote_direct_valid):
        raise RuntimeError(f"{name} must be a TLS-required direct PostgreSQL URL.")
    return value.replace("postgresql://", "postgresql+psycopg://", 1)


def _snapshot(url: str) -> dict[str, object]:
    engine = create_engine(url, pool_pre_ping=True)
    try:
        inspector = inspect(engine)
        tables = sorted(
            name for name in inspector.get_table_names(schema="public")
            if name.startswith("library_")
        )
        with engine.connect() as connection:
            counts = {
                table_name: connection.execute(
                    text(f'SELECT count(*) FROM public."{table_name}"')
                ).scalar_one()
                for table_name in tables
            }
            revision = connection.execute(
                text("SELECT version_num FROM public.alembic_version")
            ).scalar_one()
            constraints = connection.execute(
                text(
                    "SELECT conrelid::regclass::text, contype, count(*) "
                    "FROM pg_constraint "
                    "WHERE connamespace = 'public'::regnamespace "
                    "GROUP BY conrelid::regclass::text, contype "
                    "ORDER BY 1, 2"
                )
            ).all()
        audit_columns = sorted(
            column["name"]
            for column in inspector.get_columns("library_admin_audit", schema="public")
        )
        return {
            "revision": revision,
            "tables": tables,
            "counts": counts,
            "constraints": [list(row) for row in constraints],
            "audit_columns": audit_columns,
        }
    finally:
        engine.dispose()


def main() -> None:
    if os.environ.get("FSL_DATA_CLASSIFICATION") != "synthetic-only":
        raise RuntimeError("Only synthetic restore verification is allowed.")
    if os.environ.get("FSL_PHASE8A_LOCAL_EVIDENCE") == "confirmed":
        required_flags = {
            "EXTERNAL_SIDE_EFFECTS_ENABLED": "false",
            "PHASE7_DRIVE_API_ENABLED": "false",
            "PHASE7_DRIVE_KILL_SWITCH": "true",
        }
        for name, expected in required_flags.items():
            if os.environ.get(name, "").lower() != expected:
                raise RuntimeError(f"{name} must be {expected}.")
    source = _snapshot(_direct_url("FSL_BACKUP_DATABASE_URL"))
    restored = _snapshot(_direct_url("FSL_RESTORE_DATABASE_URL"))
    if source != restored:
        raise RuntimeError("Restored schema, counts, constraints, or audit columns differ.")
    print(
        json.dumps(
            {
                "status": "pass",
                "revision": restored["revision"],
                "table_count": len(restored["tables"]),
                "row_count": sum(restored["counts"].values()),
                "constraints_verified": True,
                "audit_columns_verified": True,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
