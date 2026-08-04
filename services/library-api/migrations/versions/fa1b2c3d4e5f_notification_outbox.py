"""add isolated notification outbox

Revision ID: fa1b2c3d4e5f
Revises: e9f0a1b2c3d4
Create Date: 2026-08-04

The outbox stores only opaque foreign keys and delivery state. Rendered mail,
recipient addresses, student numbers, questions, and consent text remain out of
the queue. Worker privileges are granted separately after migration.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "fa1b2c3d4e5f"
down_revision: str | Sequence[str] | None = "e9f0a1b2c3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "library_notification_outbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("access_grant_id", sa.Uuid(), nullable=False),
        sa.Column("drive_operation_id", sa.Uuid(), nullable=False),
        sa.Column("notification_key", sa.String(length=255), nullable=False),
        sa.Column("notification_type", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "max_attempts",
            sa.Integer(),
            server_default="5",
            nullable=False,
        ),
        sa.Column("error_code", sa.String(length=128), nullable=True),
        sa.Column("error_summary", sa.String(length=500), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_owner", sa.String(length=64), nullable=True),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "external_action_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "record_version",
            sa.BigInteger(),
            server_default="1",
            nullable=False,
        ),
        sa.CheckConstraint(
            (
                "notification_type IN "
                "('registration_drive_granted')"
            ),
            name="ck_library_notification_outbox_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed', 'dead')",
            name="ck_library_notification_outbox_status",
        ),
        sa.ForeignKeyConstraint(
            ["member_id"],
            ["library_members.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["application_id"],
            ["library_applications.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["access_grant_id"],
            ["library_access_grants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["drive_operation_id"],
            ["library_operations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "drive_operation_id",
            "notification_type",
            name="uq_library_notification_outbox_operation_type",
        ),
        sa.UniqueConstraint("notification_key"),
    )
    op.create_index(
        "ix_library_notification_outbox_member_id",
        "library_notification_outbox",
        ["member_id"],
        unique=False,
    )
    op.create_index(
        "ix_library_notification_outbox_application_id",
        "library_notification_outbox",
        ["application_id"],
        unique=False,
    )
    op.create_index(
        "ix_library_notification_outbox_access_grant_id",
        "library_notification_outbox",
        ["access_grant_id"],
        unique=False,
    )
    op.create_index(
        "ix_library_notification_outbox_drive_operation_id",
        "library_notification_outbox",
        ["drive_operation_id"],
        unique=False,
    )
    op.create_index(
        "ix_library_notification_outbox_due",
        "library_notification_outbox",
        ["status", "next_attempt_at", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_library_notification_outbox_due",
        table_name="library_notification_outbox",
    )
    op.drop_index(
        "ix_library_notification_outbox_drive_operation_id",
        table_name="library_notification_outbox",
    )
    op.drop_index(
        "ix_library_notification_outbox_access_grant_id",
        table_name="library_notification_outbox",
    )
    op.drop_index(
        "ix_library_notification_outbox_application_id",
        table_name="library_notification_outbox",
    )
    op.drop_index(
        "ix_library_notification_outbox_member_id",
        table_name="library_notification_outbox",
    )
    op.drop_table("library_notification_outbox")
