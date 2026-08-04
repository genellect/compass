"""phase9 integrity, provenance, and target pinning hardening

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-08-01 22:00:00.000000

Existing Phase 9 rows cannot be safely backfilled: the prior schema did not
persist the Drive target fingerprint or a pre-approval normalized-row digest.
The online migration therefore fails closed when a batch already exists. An
operator must preserve evidence, review, and re-stage that snapshot instead of
allowing this migration to invent lineage.
"""

from collections.abc import Sequence

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e0f1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _assert_no_existing_phase9_batches() -> None:
    if context.is_offline_mode():
        if context.get_context().dialect.name == "postgresql":
            op.execute(
                """
                DO $$
                BEGIN
                  IF EXISTS (SELECT 1 FROM library_import_batches) THEN
                    RAISE EXCEPTION
                      'phase9 integrity migration requires an empty import batch table';
                  END IF;
                END;
                $$
                """
            )
        return
    count = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM library_import_batches")
    ).scalar_one()
    if count:
        raise RuntimeError(
            "Phase 9 integrity migration is blocked because import batches "
            "already exist; preserve evidence and re-stage them under the "
            "hardened contract."
        )


def _drop_sqlite_source_payload_trigger() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.execute(
            "DROP TRIGGER IF EXISTS library_import_source_payload_immutable"
        )


def _create_sqlite_source_payload_trigger() -> None:
    if op.get_bind().dialect.name == "sqlite":
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


def _ensure_export_status_payload_constraint() -> None:
    """Reconcile pre-release e0 databases created before this check existed."""

    if context.is_offline_mode():
        # The checked-in e0 upgrade emits this constraint in offline builds.
        return
    bind = op.get_bind()
    constraint_name = "ck_library_export_runs_status_payload"
    existing = {
        item.get("name")
        for item in inspect(bind).get_check_constraints(
            "library_export_runs"
        )
    }
    if constraint_name in existing:
        return
    with op.batch_alter_table("library_export_runs") as batch_op:
        batch_op.create_check_constraint(
            constraint_name,
            (
                "(status = 'generated' AND content_hash IS NOT NULL "
                "AND failure_code IS NULL) OR "
                "(status = 'failed' AND content_hash IS NULL "
                "AND row_count = 0 AND byte_count = 0 "
                "AND failure_code IS NOT NULL)"
            ),
        )


def upgrade() -> None:
    _assert_no_existing_phase9_batches()
    _ensure_export_status_payload_constraint()
    _drop_sqlite_source_payload_trigger()

    with op.batch_alter_table("library_import_batches") as batch_op:
        batch_op.add_column(
            sa.Column("target_drive_resource_fingerprint", sa.String(64))
        )
        batch_op.add_column(
            sa.Column("staged_normalized_hash", sa.String(64))
        )
        batch_op.alter_column(
            "target_drive_resource_fingerprint",
            nullable=False,
        )
        batch_op.alter_column("staged_normalized_hash", nullable=False)

    with op.batch_alter_table("library_import_rows") as batch_op:
        batch_op.add_column(
            sa.Column("normalized_payload_hash", sa.String(64))
        )
        batch_op.add_column(
            sa.Column("legacy_terms_consent_recorded", sa.Boolean())
        )
        batch_op.add_column(
            sa.Column("legacy_privacy_consent_recorded", sa.Boolean())
        )
        batch_op.add_column(
            sa.Column("consent_version_provenance", sa.String(32))
        )
        batch_op.add_column(
            sa.Column("consent_timestamp_provenance", sa.String(32))
        )
        batch_op.alter_column("normalized_payload_hash", nullable=False)
        batch_op.alter_column("consent_version_provenance", nullable=False)
        batch_op.alter_column("consent_timestamp_provenance", nullable=False)
        batch_op.create_check_constraint(
            "ck_library_import_rows_consent_version_provenance",
            (
                "consent_version_provenance IN "
                "('legacy_unknown', 'not_applicable')"
            ),
        )
        batch_op.create_check_constraint(
            "ck_library_import_rows_consent_timestamp_provenance",
            (
                "consent_timestamp_provenance IN "
                "('legacy_unknown', 'not_applicable')"
            ),
        )
    _create_sqlite_source_payload_trigger()


def downgrade() -> None:
    if not context.is_offline_mode():
        count = op.get_bind().execute(
            sa.text("SELECT COUNT(*) FROM library_import_batches")
        ).scalar_one()
        if count:
            raise RuntimeError(
                "Phase 9 integrity downgrade is blocked after a snapshot "
                "batch is staged; restore the approved backup instead."
            )

    # A pre-release persistent e0 volume may predate the final e0 check. The
    # downgrade must restore the logical current e0 schema so e0's own
    # downgrade can safely remove the constraint without rewriting e0 history.
    _ensure_export_status_payload_constraint()
    _drop_sqlite_source_payload_trigger()

    with op.batch_alter_table("library_import_rows") as batch_op:
        batch_op.drop_constraint(
            "ck_library_import_rows_consent_timestamp_provenance",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_library_import_rows_consent_version_provenance",
            type_="check",
        )
        batch_op.drop_column("consent_timestamp_provenance")
        batch_op.drop_column("consent_version_provenance")
        batch_op.drop_column("legacy_privacy_consent_recorded")
        batch_op.drop_column("legacy_terms_consent_recorded")
        batch_op.drop_column("normalized_payload_hash")

    with op.batch_alter_table("library_import_batches") as batch_op:
        batch_op.drop_column("staged_normalized_hash")
        batch_op.drop_column("target_drive_resource_fingerprint")
    _create_sqlite_source_payload_trigger()
