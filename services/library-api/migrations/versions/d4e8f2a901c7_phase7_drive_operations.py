"""phase7 drive operations

Revision ID: d4e8f2a901c7
Revises: 6bb0eb9832ab
Create Date: 2026-07-28 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d4e8f2a901c7"
down_revision: str | Sequence[str] | None = "6bb0eb9832ab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_access_grants") as batch_op:
        batch_op.add_column(
            sa.Column(
                "managed_by_system",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "notification_status",
                sa.String(length=32),
                server_default="pending",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "notification_sent_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.create_check_constraint(
            "ck_library_access_grants_notification_status",
            (
                "notification_status IN "
                "('pending', 'sent_by_drive', 'not_applicable', 'failed')"
            ),
        )

    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.add_column(
            sa.Column("lease_owner", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "locked_until",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "external_action_started_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "completed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.create_index(
            "ix_library_operations_due",
            [
                "operation_type",
                "status",
                "next_attempt_at",
                "created_at",
            ],
            unique=False,
        )

    op.create_table(
        "library_resource_leases",
        sa.Column("resource_id", sa.String(length=255), nullable=False),
        sa.Column("lease_owner", sa.String(length=64), nullable=True),
        sa.Column(
            "locked_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
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
        sa.PrimaryKeyConstraint("resource_id"),
    )


def downgrade() -> None:
    op.drop_table("library_resource_leases")

    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.drop_index("ix_library_operations_due")
        batch_op.drop_column("completed_at")
        batch_op.drop_column("external_action_started_at")
        batch_op.drop_column("locked_until")
        batch_op.drop_column("lease_owner")

    with op.batch_alter_table("library_access_grants") as batch_op:
        batch_op.drop_constraint(
            "ck_library_access_grants_notification_status",
            type_="check",
        )
        batch_op.drop_column("notification_sent_at")
        batch_op.drop_column("notification_status")
        batch_op.drop_column("managed_by_system")
