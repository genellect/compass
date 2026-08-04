"""Add the nullable operational registration timestamp to the member roster.

Revision ID: b2c3d4e5f6a7
Revises: f1a2b3c4d5e6
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_members") as batch_op:
        batch_op.add_column(
            sa.Column("registered_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index(
            "ix_library_members_registered_at",
            ["registered_at"],
            unique=False,
        )
    op.execute(
        "UPDATE library_members SET registered_at = created_at "
        "WHERE registered_at IS NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table("library_members") as batch_op:
        batch_op.drop_index("ix_library_members_registered_at")
        batch_op.drop_column("registered_at")
