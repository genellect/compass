"""Read-only Phase 7 schema verification for the synthetic Neon project."""

from __future__ import annotations

import json

from sqlalchemy import text

from app.config import Settings
from app.db.session import create_database_engine, is_transaction_pooler_url


EXPECTED_REVISION = "a8c4d7e219bf"
EXPECTED_GRANT_COLUMNS = {
    "managed_by_system",
    "notification_status",
    "notification_sent_at",
}
EXPECTED_OPERATION_COLUMNS = {
    "lease_owner",
    "locked_until",
    "external_action_started_at",
    "completed_at",
    "resource_id",
}
EXPECTED_TABLES = {"library_resource_leases"}


def _columns(connection, table_name: str) -> set[str]:
    return set(
        connection.execute(
            text(
                "SELECT column_name "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :table_name"
            ),
            {"table_name": table_name},
        ).scalars()
    )


def main() -> None:
    settings = Settings()
    if settings.external_side_effects_enabled:
        raise RuntimeError("External side effects must remain disabled.")
    if settings.phase7_drive_api_enabled:
        raise RuntimeError("Phase 7 Drive API must remain disabled for schema checks.")
    if not settings.phase7_drive_kill_switch:
        raise RuntimeError("Phase 7 Drive kill switch must remain enabled.")
    if not is_transaction_pooler_url(settings.database_url):
        raise RuntimeError("DATABASE_URL must use the Neon pooled endpoint.")
    if is_transaction_pooler_url(settings.migration_database_url):
        raise RuntimeError("DATABASE_URL_UNPOOLED must use the Neon direct endpoint.")

    engine = create_database_engine(settings)
    try:
        with engine.connect() as connection:
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            grant_columns = _columns(connection, "library_access_grants")
            operation_columns = _columns(connection, "library_operations")
            tables = set(
                connection.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                ).scalars()
            )
    finally:
        engine.dispose()

    if revision != EXPECTED_REVISION:
        raise RuntimeError("Neon is not at the Phase 7 revision.")
    if EXPECTED_GRANT_COLUMNS - grant_columns:
        raise RuntimeError("Phase 7 access-grant columns are incomplete.")
    if EXPECTED_OPERATION_COLUMNS - operation_columns:
        raise RuntimeError("Phase 7 operation lease columns are incomplete.")
    if EXPECTED_TABLES - tables:
        raise RuntimeError("Phase 7 resource-lease table is missing.")

    print(
        json.dumps(
            {
                "status": "pass",
                "connection": "pooled_read_direct_migrate",
                "revision": revision,
                "grant_columns": sorted(EXPECTED_GRANT_COLUMNS),
                "operation_columns": sorted(EXPECTED_OPERATION_COLUMNS),
                "resource_lease_table": True,
                "external_side_effects_enabled": False,
                "drive_api_enabled": False,
                "drive_kill_switch": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
