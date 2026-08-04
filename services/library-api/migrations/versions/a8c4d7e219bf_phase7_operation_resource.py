"""phase7 operation resource target

Revision ID: a8c4d7e219bf
Revises: d4e8f2a901c7
Create Date: 2026-07-28 00:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a8c4d7e219bf"
down_revision: str | Sequence[str] | None = "d4e8f2a901c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.add_column(
            sa.Column("resource_id", sa.String(length=255), nullable=True)
        )
        batch_op.create_index(
            "ix_library_operations_resource_id",
            ["resource_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.drop_index("ix_library_operations_resource_id")
        batch_op.drop_column("resource_id")
