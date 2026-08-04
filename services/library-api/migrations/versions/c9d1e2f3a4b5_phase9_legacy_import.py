"""phase9 legacy snapshot import controls

Revision ID: c9d1e2f3a4b5
Revises: f8b0a1c2d3e4
Create Date: 2026-08-01 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c9d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "f8b0a1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_import_batches") as batch_op:
        batch_op.drop_constraint(
            "ck_library_import_batches_status",
            type_="check",
        )
        batch_op.add_column(
            sa.Column("normalization_rule_version", sa.String(64))
        )
        batch_op.add_column(sa.Column("fingerprint_key_version", sa.String(64)))
        batch_op.add_column(
            sa.Column("reference_at", sa.DateTime(timezone=True))
        )
        batch_op.add_column(sa.Column("source_manifest_json", sa.JSON()))
        batch_op.add_column(sa.Column("dry_run_report_json", sa.JSON()))
        batch_op.add_column(sa.Column("dry_run_hash", sa.String(64)))
        batch_op.add_column(
            sa.Column(
                "raw_snapshot_expires_at",
                sa.DateTime(timezone=True),
            )
        )
        batch_op.add_column(
            sa.Column(
                "legal_hold",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("raw_purged_at", sa.DateTime(timezone=True))
        )
        batch_op.add_column(sa.Column("approved_at", sa.DateTime(timezone=True)))
        batch_op.add_column(sa.Column("approved_by_admin_id", sa.Uuid()))
        batch_op.add_column(sa.Column("approved_source_hash", sa.String(128)))
        batch_op.add_column(
            sa.Column("approved_normalized_hash", sa.String(64))
        )
        batch_op.add_column(sa.Column("approval_key", sa.String(128)))
        batch_op.add_column(sa.Column("approval_reason", sa.String(500)))
        batch_op.add_column(
            sa.Column("rolled_back_at", sa.DateTime(timezone=True))
        )
        batch_op.add_column(sa.Column("rolled_back_by_admin_id", sa.Uuid()))
        batch_op.add_column(sa.Column("rollback_reason", sa.String(500)))
        batch_op.add_column(sa.Column("rejected_at", sa.DateTime(timezone=True)))
        batch_op.add_column(sa.Column("rejected_by_admin_id", sa.Uuid()))
        batch_op.add_column(sa.Column("rejection_reason", sa.String(500)))
        batch_op.add_column(
            sa.Column(
                "record_version",
                sa.BigInteger(),
                server_default="1",
                nullable=False,
            )
        )
        batch_op.create_foreign_key(
            "fk_library_import_batches_approved_by_admin",
            "library_admins",
            ["approved_by_admin_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_foreign_key(
            "fk_library_import_batches_rolled_back_by_admin",
            "library_admins",
            ["rolled_back_by_admin_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_foreign_key(
            "fk_library_import_batches_rejected_by_admin",
            "library_admins",
            ["rejected_by_admin_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index(
            "ix_library_import_batches_approved_by_admin_id",
            ["approved_by_admin_id"],
        )
        batch_op.create_index(
            "ix_library_import_batches_rolled_back_by_admin_id",
            ["rolled_back_by_admin_id"],
        )
        batch_op.create_index(
            "ix_library_import_batches_rejected_by_admin_id",
            ["rejected_by_admin_id"],
        )
        batch_op.create_unique_constraint(
            "uq_library_import_batches_approval_key",
            ["approval_key"],
        )

    op.execute(
        "UPDATE library_import_batches SET "
        "normalization_rule_version = 'legacy-unversioned', "
        "fingerprint_key_version = 'legacy-unversioned', "
        "reference_at = created_at, source_manifest_json = '{}', "
        "dry_run_report_json = '{}'"
    )
    with op.batch_alter_table("library_import_batches") as batch_op:
        batch_op.alter_column("normalization_rule_version", nullable=False)
        batch_op.alter_column("fingerprint_key_version", nullable=False)
        batch_op.alter_column("reference_at", nullable=False)
        batch_op.alter_column("source_manifest_json", nullable=False)
        batch_op.alter_column("dry_run_report_json", nullable=False)
        batch_op.create_check_constraint(
            "ck_library_import_batches_status",
            (
                "status IN ('staged', 'validated', 'approved', 'applied', "
                "'rolled_back', 'rejected')"
            ),
        )

    with op.batch_alter_table("library_import_rows") as batch_op:
        batch_op.drop_constraint(
            "uq_library_import_rows_batch_row",
            type_="unique",
        )
        batch_op.add_column(sa.Column("source_system", sa.String(32)))
        batch_op.add_column(
            sa.Column("source_row_fingerprint", sa.String(64))
        )
        batch_op.add_column(sa.Column("raw_payload_hash", sa.String(64)))
        batch_op.add_column(
            sa.Column("fingerprint_key_version", sa.String(64))
        )
        batch_op.add_column(
            sa.Column("normalization_rule_version", sa.String(64))
        )
        batch_op.add_column(sa.Column("resolution_json", sa.JSON()))
        batch_op.add_column(
            sa.Column(
                "apply_status",
                sa.String(32),
                server_default="pending",
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("applied_member_id", sa.Uuid()))
        batch_op.add_column(
            sa.Column("applied_access_grant_id", sa.Uuid())
        )
        batch_op.add_column(
            sa.Column(
                "member_created_by_batch",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "access_grant_created_by_batch",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("applied_member_snapshot_hash", sa.String(64))
        )
        batch_op.add_column(
            sa.Column("applied_access_grant_snapshot_hash", sa.String(64))
        )
        batch_op.add_column(
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            )
        )

    op.execute(
        "UPDATE library_import_rows SET "
        "source_system = COALESCE((SELECT source_type FROM "
        "library_import_batches WHERE library_import_batches.id = "
        "library_import_rows.batch_id), 'legacy_unknown'), "
        "source_row_fingerprint = CAST(id AS VARCHAR), "
        "raw_payload_hash = CAST(id AS VARCHAR), "
        "fingerprint_key_version = 'legacy-unversioned', "
        "normalization_rule_version = COALESCE((SELECT "
        "normalization_rule_version FROM library_import_batches WHERE "
        "library_import_batches.id = library_import_rows.batch_id), "
        "'legacy-unversioned'), "
        "resolution_json = '{}', "
        "created_at = CURRENT_TIMESTAMP, "
        "classification = CASE WHEN classification IN "
        "('ready', 'manual_resolution', 'excluded') THEN classification "
        "ELSE 'manual_resolution' END"
    )
    with op.batch_alter_table("library_import_rows") as batch_op:
        batch_op.alter_column("source_system", nullable=False)
        batch_op.alter_column("source_row_fingerprint", nullable=False)
        batch_op.alter_column("raw_payload_hash", nullable=False)
        batch_op.alter_column("fingerprint_key_version", nullable=False)
        batch_op.alter_column("normalization_rule_version", nullable=False)
        batch_op.alter_column("resolution_json", nullable=False)
        batch_op.alter_column("created_at", nullable=False)
        batch_op.create_unique_constraint(
            "uq_library_import_rows_batch_row",
            ["batch_id", "source_system", "source_row_number"],
        )
        batch_op.create_unique_constraint(
            "uq_library_import_rows_batch_fingerprint",
            ["batch_id", "source_row_fingerprint"],
        )
        batch_op.create_check_constraint(
            "ck_library_import_rows_positive_row_number",
            "source_row_number > 0",
        )
        batch_op.create_check_constraint(
            "ck_library_import_rows_classification",
            "classification IN ('ready', 'manual_resolution', 'excluded')",
        )
        batch_op.create_check_constraint(
            "ck_library_import_rows_apply_status",
            "apply_status IN ('pending', 'applied', 'skipped', 'rolled_back')",
        )
        batch_op.create_index(
            "ix_library_import_rows_applied_member_id",
            ["applied_member_id"],
        )
        batch_op.create_index(
            "ix_library_import_rows_applied_access_grant_id",
            ["applied_access_grant_id"],
        )

    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            CREATE FUNCTION deny_library_import_source_payload_mutation()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.source_payload::text IS DISTINCT FROM OLD.source_payload::text
                 AND NOT (
                   NEW.source_payload::text = '{}'
                   AND EXISTS (
                     SELECT 1 FROM library_import_batches batch
                     WHERE batch.id = NEW.batch_id
                       AND batch.raw_purged_at IS NOT NULL
                   )
                 ) THEN
                RAISE EXCEPTION 'library_import source_payload is immutable';
              END IF;
              RETURN NEW;
            END;
            $$
            """
        )
        op.execute(
            """
            CREATE TRIGGER library_import_source_payload_immutable
            BEFORE UPDATE OF source_payload ON library_import_rows
            FOR EACH ROW EXECUTE FUNCTION
            deny_library_import_source_payload_mutation()
            """
        )
    else:
        op.execute(
            """
            CREATE TRIGGER library_import_source_payload_immutable
            BEFORE UPDATE OF source_payload ON library_import_rows
            FOR EACH ROW
            WHEN NEW.source_payload <> '{}'
              OR NOT EXISTS (
                SELECT 1 FROM library_import_batches batch
                WHERE batch.id = NEW.batch_id
                  AND batch.raw_purged_at IS NOT NULL
              )
            BEGIN
              SELECT RAISE(ABORT, 'library_import source_payload is immutable');
            END
            """
        )


def downgrade() -> None:
    import_row_count = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM library_import_rows")
    ).scalar_one()
    if import_row_count:
        raise RuntimeError(
            "Phase 9 downgrade is blocked after legacy rows are staged; "
            "rollback or restore the approved backup instead."
        )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS library_import_source_payload_immutable "
            "ON library_import_rows"
        )
        op.execute(
            "DROP FUNCTION IF EXISTS "
            "deny_library_import_source_payload_mutation()"
        )
    else:
        op.execute(
            "DROP TRIGGER IF EXISTS library_import_source_payload_immutable"
        )

    with op.batch_alter_table("library_import_rows") as batch_op:
        batch_op.drop_index("ix_library_import_rows_applied_access_grant_id")
        batch_op.drop_index("ix_library_import_rows_applied_member_id")
        batch_op.drop_constraint(
            "ck_library_import_rows_apply_status",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_library_import_rows_classification",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_library_import_rows_positive_row_number",
            type_="check",
        )
        batch_op.drop_constraint(
            "uq_library_import_rows_batch_fingerprint",
            type_="unique",
        )
        batch_op.drop_constraint(
            "uq_library_import_rows_batch_row",
            type_="unique",
        )
        batch_op.create_unique_constraint(
            "uq_library_import_rows_batch_row",
            ["batch_id", "source_row_number"],
        )
        batch_op.drop_column("created_at")
        batch_op.drop_column("applied_access_grant_snapshot_hash")
        batch_op.drop_column("applied_member_snapshot_hash")
        batch_op.drop_column("access_grant_created_by_batch")
        batch_op.drop_column("member_created_by_batch")
        batch_op.drop_column("applied_access_grant_id")
        batch_op.drop_column("applied_member_id")
        batch_op.drop_column("apply_status")
        batch_op.drop_column("resolution_json")
        batch_op.drop_column("normalization_rule_version")
        batch_op.drop_column("fingerprint_key_version")
        batch_op.drop_column("raw_payload_hash")
        batch_op.drop_column("source_row_fingerprint")
        batch_op.drop_column("source_system")

    op.execute(
        "UPDATE library_import_batches SET status = 'rejected' "
        "WHERE status = 'rolled_back'"
    )
    with op.batch_alter_table("library_import_batches") as batch_op:
        batch_op.drop_constraint(
            "ck_library_import_batches_status",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_library_import_batches_status",
            "status IN ('staged', 'validated', 'approved', 'applied', 'rejected')",
        )
        batch_op.drop_constraint(
            "uq_library_import_batches_approval_key",
            type_="unique",
        )
        batch_op.drop_index(
            "ix_library_import_batches_rejected_by_admin_id"
        )
        batch_op.drop_index(
            "ix_library_import_batches_rolled_back_by_admin_id"
        )
        batch_op.drop_index(
            "ix_library_import_batches_approved_by_admin_id"
        )
        batch_op.drop_constraint(
            "fk_library_import_batches_rejected_by_admin",
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            "fk_library_import_batches_rolled_back_by_admin",
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            "fk_library_import_batches_approved_by_admin",
            type_="foreignkey",
        )
        batch_op.drop_column("record_version")
        batch_op.drop_column("rejection_reason")
        batch_op.drop_column("rejected_by_admin_id")
        batch_op.drop_column("rejected_at")
        batch_op.drop_column("rollback_reason")
        batch_op.drop_column("rolled_back_by_admin_id")
        batch_op.drop_column("rolled_back_at")
        batch_op.drop_column("approval_reason")
        batch_op.drop_column("approval_key")
        batch_op.drop_column("approved_normalized_hash")
        batch_op.drop_column("approved_source_hash")
        batch_op.drop_column("approved_by_admin_id")
        batch_op.drop_column("approved_at")
        batch_op.drop_column("raw_purged_at")
        batch_op.drop_column("legal_hold")
        batch_op.drop_column("raw_snapshot_expires_at")
        batch_op.drop_column("dry_run_hash")
        batch_op.drop_column("dry_run_report_json")
        batch_op.drop_column("source_manifest_json")
        batch_op.drop_column("reference_at")
        batch_op.drop_column("fingerprint_key_version")
        batch_op.drop_column("normalization_rule_version")
