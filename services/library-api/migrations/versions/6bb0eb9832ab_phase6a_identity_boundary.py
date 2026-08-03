"""phase6a identity boundary

Revision ID: 6bb0eb9832ab
Revises: 3ee520dc1b7a
Create Date: 2026-07-28 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "6bb0eb9832ab"
down_revision: str | Sequence[str] | None = "3ee520dc1b7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_applications") as batch_op:
        batch_op.add_column(
            sa.Column(
                "authentication_subject_hash",
                sa.String(length=64),
                nullable=True,
            )
        )
        batch_op.create_index(
            "ix_library_applications_authentication_subject_hash",
            ["authentication_subject_hash"],
            unique=False,
        )

    with op.batch_alter_table("library_identities") as batch_op:
        batch_op.add_column(
            sa.Column(
                "email_verified",
                sa.Boolean(),
                server_default=sa.true(),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "issuer",
                sa.String(length=255),
                server_default="https://accounts.google.com",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("audience", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "last_verified_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("library_identities") as batch_op:
        batch_op.drop_column("last_verified_at")
        batch_op.drop_column("audience")
        batch_op.drop_column("issuer")
        batch_op.drop_column("email_verified")

    with op.batch_alter_table("library_applications") as batch_op:
        batch_op.drop_index(
            "ix_library_applications_authentication_subject_hash"
        )
        batch_op.drop_column("authentication_subject_hash")
