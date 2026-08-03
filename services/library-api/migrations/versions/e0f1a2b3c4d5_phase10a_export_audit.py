"""phase10a immutable export audit metadata

Revision ID: e0f1a2b3c4d5
Revises: c9d1e2f3a4b5
Create Date: 2026-08-01
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e0f1a2b3c4d5"
down_revision: str | None = "c9d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_export_runs") as batch_op:
        batch_op.add_column(
            sa.Column(
                "status",
                sa.String(length=16),
                server_default="generated",
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("request_id", sa.String(length=64)))
        batch_op.add_column(sa.Column("action_key", sa.String(length=64)))
        batch_op.add_column(
            sa.Column("request_fingerprint", sa.String(length=64))
        )
        batch_op.add_column(
            sa.Column(
                "byte_count",
                sa.BigInteger(),
                server_default="0",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("snapshot_at", sa.DateTime(timezone=True))
        )
        batch_op.add_column(
            sa.Column("completed_at", sa.DateTime(timezone=True))
        )
        batch_op.add_column(
            sa.Column("recommended_delete_at", sa.DateTime(timezone=True))
        )
        batch_op.add_column(
            sa.Column("failure_code", sa.String(length=128))
        )
        batch_op.alter_column(
            "content_hash",
            existing_type=sa.String(length=128),
            type_=sa.String(length=64),
            nullable=True,
        )

    # No production rows exist yet, but deterministic backfill keeps the
    # migration reversible for synthetic databases created from earlier heads.
    op.execute(
        "UPDATE library_export_runs SET "
        "request_id = 'migration-' || CAST(id AS VARCHAR), "
        "action_key = substr('migration-' || CAST(id AS VARCHAR), 1, 64), "
        "request_fingerprint = substr(content_hash, 1, 64), "
        "snapshot_at = created_at, completed_at = created_at, "
        "recommended_delete_at = created_at"
    )

    with op.batch_alter_table("library_export_runs") as batch_op:
        batch_op.alter_column("request_id", nullable=False)
        batch_op.alter_column("action_key", nullable=False)
        batch_op.alter_column("request_fingerprint", nullable=False)
        batch_op.alter_column("snapshot_at", nullable=False)
        batch_op.alter_column("completed_at", nullable=False)
        batch_op.alter_column("recommended_delete_at", nullable=False)
        batch_op.create_unique_constraint(
            "uq_library_export_runs_action_key", ["action_key"]
        )
        batch_op.create_check_constraint(
            "ck_library_export_runs_status",
            "status IN ('generated', 'failed')",
        )
        batch_op.create_check_constraint(
            "ck_library_export_runs_format",
            "export_format IN ('csv', 'xlsx')",
        )
        batch_op.create_check_constraint(
            "ck_library_export_runs_counts",
            "row_count >= 0 AND byte_count >= 0",
        )
        batch_op.create_check_constraint(
            "ck_library_export_runs_content_hash",
            "content_hash IS NULL OR length(content_hash) = 64",
        )
        batch_op.create_check_constraint(
            "ck_library_export_runs_status_payload",
            (
                "(status = 'generated' AND content_hash IS NOT NULL "
                "AND failure_code IS NULL) OR "
                "(status = 'failed' AND content_hash IS NULL "
                "AND row_count = 0 AND byte_count = 0 "
                "AND failure_code IS NOT NULL)"
            ),
        )

    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            CREATE FUNCTION deny_library_export_runs_mutation()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              RAISE EXCEPTION 'library_export_runs is append-only';
            END;
            $$
            """
        )
        op.execute(
            """
            CREATE TRIGGER library_export_runs_append_only
            BEFORE UPDATE OR DELETE ON library_export_runs
            FOR EACH ROW EXECUTE FUNCTION deny_library_export_runs_mutation()
            """
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS library_export_runs_append_only "
            "ON library_export_runs"
        )
        op.execute(
            "DROP FUNCTION IF EXISTS deny_library_export_runs_mutation()"
        )

    # The pre-Phase10A schema required a non-null digest. Failed runs never
    # produced bytes, so use an explicit sentinel only for downgrade safety.
    op.execute(
        "UPDATE library_export_runs SET content_hash = "
        "'0000000000000000000000000000000000000000000000000000000000000000' "
        "WHERE content_hash IS NULL"
    )

    with op.batch_alter_table("library_export_runs") as batch_op:
        batch_op.drop_constraint(
            "ck_library_export_runs_status_payload", type_="check"
        )
        batch_op.drop_constraint(
            "ck_library_export_runs_content_hash", type_="check"
        )
        batch_op.drop_constraint(
            "ck_library_export_runs_counts", type_="check"
        )
        batch_op.drop_constraint(
            "ck_library_export_runs_format", type_="check"
        )
        batch_op.drop_constraint(
            "ck_library_export_runs_status", type_="check"
        )
        batch_op.drop_constraint(
            "uq_library_export_runs_action_key", type_="unique"
        )
        batch_op.alter_column(
            "content_hash",
            existing_type=sa.String(length=64),
            type_=sa.String(length=128),
            nullable=False,
        )
        batch_op.drop_column("failure_code")
        batch_op.drop_column("recommended_delete_at")
        batch_op.drop_column("completed_at")
        batch_op.drop_column("snapshot_at")
        batch_op.drop_column("byte_count")
        batch_op.drop_column("request_fingerprint")
        batch_op.drop_column("action_key")
        batch_op.drop_column("request_id")
        batch_op.drop_column("status")
