"""fixed Drive target alias and operation attestation

Revision ID: d8a9b0c1e2f3
Revises: c3d4e5f6a7b8
Create Date: 2026-08-03

Existing operations deliberately remain unattested. They fail closed at the
worker and require an explicit administrator retry to receive a fresh
attestation. The migration never invents authorization evidence.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d8a9b0c1e2f3"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TARGET_ALIAS = "future-strategy-library-primary-v1"


def upgrade() -> None:
    with op.batch_alter_table("library_access_grants") as batch_op:
        batch_op.add_column(
            sa.Column(
                "target_alias",
                sa.String(length=64),
                nullable=True,
            )
        )
        batch_op.create_index(
            "ix_library_access_grants_target_alias",
            ["target_alias"],
            unique=False,
        )
        batch_op.create_unique_constraint(
            "uq_library_access_grants_member_target_alias",
            ["member_id", "target_alias"],
        )

    # A single historical grant for a member can be mapped to the sole
    # production capability without guessing between multiple resources.
    op.execute(
        sa.text(
            "UPDATE library_access_grants SET target_alias = :target_alias "
            "WHERE member_id IN ("
            "SELECT member_id FROM library_access_grants "
            "GROUP BY member_id HAVING COUNT(*) = 1"
            ")"
        ).bindparams(target_alias=TARGET_ALIAS)
    )

    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.add_column(
            sa.Column(
                "target_alias",
                sa.String(length=64),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "attestation_version",
                sa.String(length=16),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "attestation_issued_at",
                sa.BigInteger(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "attestation_nonce",
                sa.String(length=64),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "attestation_signature",
                sa.String(length=64),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "attestation_consumed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.create_index(
            "ix_library_operations_target_alias",
            ["target_alias"],
            unique=False,
        )
        batch_op.create_unique_constraint(
            "uq_library_operations_attestation_nonce",
            ["attestation_nonce"],
        )

    op.execute(
        sa.text(
            "UPDATE library_operations SET target_alias = :target_alias "
            "WHERE operation_type IN ('drive_grant', 'drive_revoke') "
            "AND member_id IN ("
            "SELECT member_id FROM library_access_grants "
            "WHERE target_alias = :target_alias"
            ")"
        ).bindparams(target_alias=TARGET_ALIAS)
    )


def downgrade() -> None:
    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.drop_constraint(
            "uq_library_operations_attestation_nonce",
            type_="unique",
        )
        batch_op.drop_index("ix_library_operations_target_alias")
        batch_op.drop_column("attestation_consumed_at")
        batch_op.drop_column("attestation_signature")
        batch_op.drop_column("attestation_nonce")
        batch_op.drop_column("attestation_issued_at")
        batch_op.drop_column("attestation_version")
        batch_op.drop_column("target_alias")

    with op.batch_alter_table("library_access_grants") as batch_op:
        batch_op.drop_constraint(
            "uq_library_access_grants_member_target_alias",
            type_="unique",
        )
        batch_op.drop_index("ix_library_access_grants_target_alias")
        batch_op.drop_column("target_alias")
