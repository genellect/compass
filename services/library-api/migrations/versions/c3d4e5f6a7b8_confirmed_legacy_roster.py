"""Allow confirmed legacy roster members without an inferred Google identity.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_members") as batch_op:
        batch_op.alter_column(
            "normalized_email",
            existing_type=sa.String(length=320),
            nullable=True,
        )


def downgrade() -> None:
    connection = op.get_bind()
    incompatible_rows = connection.execute(
        sa.text(
            "SELECT count(*) FROM library_members "
            "WHERE normalized_email IS NULL"
        )
    ).scalar_one()
    if incompatible_rows:
        raise RuntimeError(
            "confirmed legacy roster data exists; preserve it before downgrade"
        )
    with op.batch_alter_table("library_members") as batch_op:
        batch_op.alter_column(
            "normalized_email",
            existing_type=sa.String(length=320),
            nullable=False,
        )
