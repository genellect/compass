"""replace public raw-table access with bounded registration RPCs

Revision ID: e9f0a1b2c3d4
Revises: d8a9b0c1e2f3
Create Date: 2026-08-03

SQLite intentionally advances the migration marker without creating the
PostgreSQL-only capability schema. Local and unit-test registration continues
to use the existing ORM path.
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import context, op


revision: str = "e9f0a1b2c3d4"
down_revision: str | Sequence[str] | None = "d8a9b0c1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "fsl_public_api_v1.sql"


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    sql = SQL_PATH.read_text(encoding="utf-8")
    if context.is_offline_mode():
        # Offline rendering has no DBAPI connection. Escape SQLAlchemy's bind
        # marker while preserving the literal colon in the emitted SQL.
        op.execute(sql.replace(":", r"\:"))
        return
    # Execute the reviewed SQL file as driver SQL. ``op.execute`` first wraps
    # strings in SQLAlchemy ``text()`` and would misread the colon in the
    # fixed operation-key literal as a bind parameter.
    op.get_bind().exec_driver_sql(sql)


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    # Deliberately do not restore fsl_api_runtime raw-table privileges. An
    # application rollback must remain fail closed until ingress is stopped
    # and a separate reviewed grant restoration is executed.
    op.execute(
        "DROP FUNCTION IF EXISTS "
        "fsl_public_api.registration_status_v1(uuid, text, text, text)"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS "
        "fsl_public_api.submit_registration_v1(jsonb, text)"
    )
    op.execute("DROP SCHEMA IF EXISTS fsl_public_api")
    op.execute("DROP TABLE IF EXISTS fsl_private.public_registration_rpc_keys")
    op.execute("DROP SCHEMA IF EXISTS fsl_private")
