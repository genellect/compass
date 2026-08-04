"""phase8 admin operations and immutable audit

Revision ID: f8b0a1c2d3e4
Revises: a8c4d7e219bf
Create Date: 2026-08-01 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import context, op
import sqlalchemy as sa


revision: str = "f8b0a1c2d3e4"
down_revision: str | Sequence[str] | None = "a8c4d7e219bf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("library_applications") as batch_op:
        batch_op.add_column(sa.Column("request_fingerprint", sa.String(64)))
        batch_op.add_column(
            sa.Column(
                "admin_decision",
                sa.String(32),
                server_default="not_required",
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("decision_reason", sa.String(500)))
        batch_op.add_column(sa.Column("decided_at", sa.DateTime(timezone=True)))
        batch_op.add_column(sa.Column("decided_by_admin_id", sa.Uuid()))
        batch_op.add_column(
            sa.Column(
                "record_version",
                sa.BigInteger(),
                server_default="1",
                nullable=False,
            )
        )
        batch_op.create_foreign_key(
            "fk_library_applications_decided_by_admin",
            "library_admins",
            ["decided_by_admin_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_library_applications_decided_by_admin_id",
            ["decided_by_admin_id"],
        )
        batch_op.create_index(
            "ix_library_applications_admin_queue",
            ["admin_decision", "created_at"],
        )
        batch_op.create_check_constraint(
            "ck_library_applications_admin_decision",
            "admin_decision IN ('not_required', 'pending', 'approved', 'rejected')",
        )
    op.execute(
        "UPDATE library_applications SET admin_decision = 'pending' "
        "WHERE eligibility_status = 'manual_review'"
    )

    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.add_column(
            sa.Column(
                "record_version",
                sa.BigInteger(),
                server_default="1",
                nullable=False,
            )
        )

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        naming_convention = {
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
        }
        with op.batch_alter_table(
            "library_admin_audit",
            naming_convention=naming_convention,
        ) as batch_op:
            batch_op.drop_constraint(
                "fk_library_admin_audit_member_id_library_members",
                type_="foreignkey",
            )
    else:
        member_fk = "library_admin_audit_member_id_fkey"
        if not context.is_offline_mode():
            member_fk = next(
                foreign_key["name"]
                for foreign_key in sa.inspect(bind).get_foreign_keys(
                    "library_admin_audit"
                )
                if foreign_key["constrained_columns"] == ["member_id"]
            )
        with op.batch_alter_table("library_admin_audit") as batch_op:
            batch_op.drop_constraint(member_fk, type_="foreignkey")

    with op.batch_alter_table("library_admin_audit") as batch_op:
        batch_op.add_column(sa.Column("action_key", sa.String(128)))
        batch_op.add_column(sa.Column("actor_role", sa.String(32)))
        batch_op.add_column(sa.Column("result", sa.String(32)))
        batch_op.add_column(sa.Column("request_id", sa.String(64)))
        batch_op.add_column(sa.Column("application_id", sa.Uuid()))
        batch_op.add_column(sa.Column("operation_id", sa.Uuid()))
        batch_op.create_index(
            "ix_library_admin_audit_application_id", ["application_id"]
        )
        batch_op.create_index(
            "ix_library_admin_audit_operation_id", ["operation_id"]
        )
    op.execute(
        "UPDATE library_admin_audit SET "
        "action_key = CAST(id AS VARCHAR), actor_role = 'admin', "
        "result = 'legacy', request_id = 'migration'"
    )
    with op.batch_alter_table("library_admin_audit") as batch_op:
        batch_op.alter_column("action_key", nullable=False)
        batch_op.alter_column("actor_role", nullable=False)
        batch_op.alter_column("result", nullable=False)
        batch_op.alter_column("request_id", nullable=False)
        batch_op.create_unique_constraint(
            "uq_library_admin_audit_action_key", ["action_key"]
        )

    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            CREATE FUNCTION deny_library_admin_audit_mutation()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              RAISE EXCEPTION 'library_admin_audit is append-only';
            END;
            $$
            """
        )
        op.execute(
            """
            CREATE TRIGGER library_admin_audit_append_only
            BEFORE UPDATE OR DELETE ON library_admin_audit
            FOR EACH ROW EXECUTE FUNCTION deny_library_admin_audit_mutation()
            """
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS library_admin_audit_append_only "
            "ON library_admin_audit"
        )
        op.execute("DROP FUNCTION IF EXISTS deny_library_admin_audit_mutation()")

    with op.batch_alter_table("library_admin_audit") as batch_op:
        batch_op.drop_constraint("uq_library_admin_audit_action_key", type_="unique")
        batch_op.drop_index("ix_library_admin_audit_operation_id")
        batch_op.drop_index("ix_library_admin_audit_application_id")
        batch_op.drop_column("operation_id")
        batch_op.drop_column("application_id")
        batch_op.drop_column("request_id")
        batch_op.drop_column("result")
        batch_op.drop_column("actor_role")
        batch_op.drop_column("action_key")
        batch_op.create_foreign_key(
            "fk_library_admin_audit_member_id_library_members",
            "library_members",
            ["member_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("library_operations") as batch_op:
        batch_op.drop_column("record_version")

    with op.batch_alter_table("library_applications") as batch_op:
        batch_op.drop_constraint(
            "ck_library_applications_admin_decision", type_="check"
        )
        batch_op.drop_index("ix_library_applications_admin_queue")
        batch_op.drop_index("ix_library_applications_decided_by_admin_id")
        batch_op.drop_constraint(
            "fk_library_applications_decided_by_admin", type_="foreignkey"
        )
        batch_op.drop_column("record_version")
        batch_op.drop_column("decided_by_admin_id")
        batch_op.drop_column("decided_at")
        batch_op.drop_column("decision_reason")
        batch_op.drop_column("admin_decision")
        batch_op.drop_column("request_fingerprint")
