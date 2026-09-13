"""New-member group access, disabled until a separately verified cutover.

Revision ID: 12a34b56c78d
Revises: 0b1c2d3e4f5a
"""
from pathlib import Path
from alembic import context, op
import sqlalchemy as sa

revision = "12a34b56c78d"
down_revision = "0b1c2d3e4f5a"
branch_labels = None
depends_on = None

SQL_DIR = Path(__file__).resolve().parents[1] / "sql"
BOUNDARY_SQL = """
CREATE OR REPLACE FUNCTION fsl_private.freeze_access_strategy()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $freeze$
BEGIN
    IF NEW.access_strategy IS DISTINCT FROM OLD.access_strategy THEN
        RAISE EXCEPTION 'member_access_strategy_is_immutable';
    END IF;
    RETURN NEW;
END;
$freeze$;
REVOKE ALL ON FUNCTION fsl_private.freeze_access_strategy() FROM PUBLIC;
CREATE TRIGGER fsl_member_access_strategy_immutable
BEFORE UPDATE OF access_strategy ON public.library_members
FOR EACH ROW EXECUTE FUNCTION fsl_private.freeze_access_strategy();
REVOKE ALL ON public.library_access_groups, public.library_group_memberships,
    public.library_resource_group_grants FROM PUBLIC, fsl_api_runtime, fsl_admin_runtime, fsl_worker_runtime;
GRANT SELECT ON public.library_access_groups, public.library_group_memberships,
    public.library_resource_group_grants TO fsl_worker_runtime, fsl_admin_runtime;
GRANT UPDATE (reserved_count, updated_at) ON public.library_access_groups TO fsl_worker_runtime;
GRANT INSERT, UPDATE ON public.library_group_memberships TO fsl_worker_runtime;
"""


def _execute(sql):
    if context.is_offline_mode():
        op.execute(sql.replace(":", r"\:"))
    else:
        op.get_bind().exec_driver_sql(sql)


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade():
    # Server default classifies ALL historical records as legacy. No API calls.
    with op.batch_alter_table("library_members") as batch:
        batch.add_column(sa.Column("access_strategy", sa.String(32), server_default="legacy_individual", nullable=False))
        batch.create_check_constraint("ck_library_members_access_strategy", "access_strategy IN ('legacy_individual', 'group_membership')")
    op.create_table(
        "library_access_groups",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("google_group_name", sa.String(255), unique=True, nullable=False),
        sa.Column("group_email", sa.String(320), unique=True, nullable=False),
        sa.Column("cohort_key", sa.String(64), nullable=False),
        sa.Column("shard", sa.Integer(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("reserved_count", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("cohort_key", "shard", name="uq_library_group_cohort_shard"),
        sa.CheckConstraint("capacity BETWEEN 1 AND 800", name="ck_library_group_capacity"),
        sa.CheckConstraint("reserved_count >= 0 AND reserved_count <= capacity", name="ck_library_group_count"),
        sa.CheckConstraint("state IN ('ready', 'paused')", name="ck_library_group_state"),
    )
    op.create_table(
        "library_group_memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("member_id", sa.Uuid(), sa.ForeignKey("library_members.id"), unique=True, nullable=False),
        sa.Column("group_id", sa.Uuid(), sa.ForeignKey("library_access_groups.id"), nullable=False),
        sa.Column("google_membership_name", sa.String(512), unique=True),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("managed_by_system", sa.Boolean(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint("state IN ('pending', 'active', 'removed')", name="ck_library_membership_state"),
    )
    op.create_index("ix_library_group_memberships_group_id", "library_group_memberships", ["group_id"])
    op.create_table(
        "library_resource_group_grants",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("group_id", sa.Uuid(), sa.ForeignKey("library_access_groups.id"), nullable=False),
        sa.Column("target_alias", sa.String(128), nullable=False),
        sa.Column("permission_id", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("group_id", "target_alias", name="uq_library_resource_group_target"),
        sa.CheckConstraint("role = 'reader'", name="ck_library_resource_group_reader"),
    )
    if op.get_bind().dialect.name == "postgresql":
        _execute(BOUNDARY_SQL)
        _execute((SQL_DIR / "fsl_group_submit_v1.sql").read_text(encoding="utf-8"))


def downgrade():
    # Never erase active group entitlements or turn their users into legacy.
    if context.is_offline_mode():
        raise RuntimeError("group_schema_downgrade_requires_online_unused_data_check")
    if not context.is_offline_mode():
        used = op.get_bind().scalar(sa.text(
            "SELECT count(*) FROM library_members WHERE access_strategy = 'group_membership'"))
        if used:
            raise RuntimeError("group_cutover_requires_forward_recovery_not_schema_downgrade")
    if op.get_bind().dialect.name == "postgresql":
        _execute("DROP TRIGGER fsl_member_access_strategy_immutable ON public.library_members; "
                 "DROP FUNCTION fsl_private.freeze_access_strategy();")
        previous = (SQL_DIR / "fsl_public_api_v1.sql").read_text(encoding="utf-8")
        start = previous.index("CREATE OR REPLACE FUNCTION fsl_public_api.submit_registration_v1(")
        end = previous.index("$fsl_submit_registration_v1$;") + len("$fsl_submit_registration_v1$;")
        _execute(previous[start:end])
    op.drop_table("library_resource_group_grants")
    op.drop_table("library_group_memberships")
    op.drop_table("library_access_groups")
    with op.batch_alter_table("library_members") as batch:
        batch.drop_constraint("ck_library_members_access_strategy", type_="check")
        batch.drop_column("access_strategy")
