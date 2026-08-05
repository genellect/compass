"""add manual-review notifications and a bounded worker row lock

Revision ID: 0b1c2d3e4f5a
Revises: fa1b2c3d4e5f
Create Date: 2026-08-05

Manual-review outbox rows contain only opaque foreign keys and delivery state.
The worker lock function acquires a member row lock without granting the
worker role arbitrary UPDATE rights on the member roster.
"""

from collections.abc import Sequence

from alembic import context, op
import sqlalchemy as sa


revision: str = "0b1c2d3e4f5a"
down_revision: str | Sequence[str] | None = "fa1b2c3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


WORKER_LOCK_SQL = r"""
CREATE SCHEMA IF NOT EXISTS fsl_worker_api AUTHORIZATION fsl_migration;
REVOKE ALL ON SCHEMA fsl_worker_api FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fsl_worker_api
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION fsl_worker_api.lock_member_v1(p_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fsl_worker_lock_member_v1$
BEGIN
    PERFORM 1
    FROM public.library_members AS member
    WHERE member.id = p_member_id
    FOR UPDATE;
    RETURN FOUND;
END;
$fsl_worker_lock_member_v1$;

REVOKE ALL ON FUNCTION fsl_worker_api.lock_member_v1(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA fsl_worker_api TO fsl_worker_runtime;
GRANT EXECUTE ON FUNCTION fsl_worker_api.lock_member_v1(uuid)
    TO fsl_worker_runtime;
"""


MANUAL_REVIEW_RPC_SQL = r"""
CREATE OR REPLACE FUNCTION
fsl_public_api.enqueue_manual_review_notification_v1(
    p_application_id uuid,
    p_authentication_subject_hash text,
    p_candidate_notification_id uuid,
    p_rpc_key_version text,
    p_rpc_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fsl_enqueue_manual_review_notification_v1$
DECLARE
    v_expected_token_hash bytea;
    v_actual_token_hash bytea;
    v_rpc_token_valid boolean := false;
    v_member_id uuid;
    v_notification_id uuid;
    v_notification_key text;
BEGIN
    SELECT key.token_sha256
    INTO v_expected_token_hash
    FROM fsl_private.public_registration_rpc_keys AS key
    WHERE key.key_version = p_rpc_key_version
      AND key.active;
    IF p_rpc_token IS NOT NULL
       AND pg_catalog.octet_length(pg_catalog.convert_to(p_rpc_token, 'UTF8'))
           BETWEEN 32 AND 512
       AND v_expected_token_hash IS NOT NULL THEN
        v_actual_token_hash := pg_catalog.sha256(
            pg_catalog.convert_to(p_rpc_token, 'UTF8')
        );
        SELECT pg_catalog.bool_and(
            pg_catalog.get_byte(v_expected_token_hash, byte_index.value)
            = pg_catalog.get_byte(v_actual_token_hash, byte_index.value)
        )
        INTO v_rpc_token_valid
        FROM pg_catalog.generate_series(0, 31) AS byte_index(value);
    END IF;
    IF NOT COALESCE(v_rpc_token_valid, false) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'invalid_public_rpc_capability';
    END IF;

    SELECT application.member_id
    INTO v_member_id
    FROM public.library_applications AS application
    WHERE application.id = p_application_id
      AND application.authentication_subject_hash
          = p_authentication_subject_hash
      AND application.eligibility_status = 'manual_review'
      AND application.admin_decision = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'manual_review_notification_not_authorized';
    END IF;

    v_notification_key := 'manual_review:' || p_application_id::text || ':v1';
    SELECT notification.id
    INTO v_notification_id
    FROM public.library_notification_outbox AS notification
    WHERE notification.notification_key = v_notification_key;
    IF FOUND THEN
        RETURN v_notification_id;
    END IF;

    INSERT INTO public.library_notification_outbox (
        id,
        member_id,
        application_id,
        access_grant_id,
        drive_operation_id,
        notification_key,
        notification_type,
        status,
        attempt_count,
        max_attempts,
        record_version
    ) VALUES (
        p_candidate_notification_id,
        v_member_id,
        p_application_id,
        NULL,
        NULL,
        v_notification_key,
        'manual_review_requested',
        'pending',
        0,
        5,
        1
    )
    ON CONFLICT (notification_key) DO NOTHING;

    SELECT notification.id
    INTO v_notification_id
    FROM public.library_notification_outbox AS notification
    WHERE notification.notification_key = v_notification_key;
    IF v_notification_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'manual_review_notification_enqueue_failed';
    END IF;
    RETURN v_notification_id;
END;
$fsl_enqueue_manual_review_notification_v1$;

REVOKE ALL ON FUNCTION
    fsl_public_api.enqueue_manual_review_notification_v1(
        uuid,
        text,
        uuid,
        text,
        text
    )
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    fsl_public_api.enqueue_manual_review_notification_v1(
        uuid,
        text,
        uuid,
        text,
        text
    )
TO fsl_api_runtime;
"""


def upgrade() -> None:
    with op.batch_alter_table("library_notification_outbox") as batch_op:
        batch_op.drop_constraint(
            "ck_library_notification_outbox_type",
            type_="check",
        )
        batch_op.alter_column(
            "member_id",
            existing_type=sa.Uuid(),
            nullable=True,
        )
        batch_op.alter_column(
            "access_grant_id",
            existing_type=sa.Uuid(),
            nullable=True,
        )
        batch_op.alter_column(
            "drive_operation_id",
            existing_type=sa.Uuid(),
            nullable=True,
        )
        batch_op.create_check_constraint(
            "ck_library_notification_outbox_type",
            (
                "notification_type IN "
                "('registration_drive_granted', 'manual_review_requested')"
            ),
        )
        batch_op.create_check_constraint(
            "ck_library_notification_outbox_source",
            (
                "(notification_type = 'registration_drive_granted' "
                "AND member_id IS NOT NULL "
                "AND access_grant_id IS NOT NULL "
                "AND drive_operation_id IS NOT NULL) OR "
                "(notification_type = 'manual_review_requested' "
                "AND access_grant_id IS NULL "
                "AND drive_operation_id IS NULL)"
            ),
        )

    if op.get_bind().dialect.name == "postgresql":
        if context.is_offline_mode():
            op.execute(WORKER_LOCK_SQL.replace(":", r"\:"))
            op.execute(MANUAL_REVIEW_RPC_SQL.replace(":", r"\:"))
        else:
            op.get_bind().exec_driver_sql(WORKER_LOCK_SQL)
            op.get_bind().exec_driver_sql(MANUAL_REVIEW_RPC_SQL)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP FUNCTION IF EXISTS "
            "fsl_public_api.enqueue_manual_review_notification_v1("
            "uuid, text, uuid, text, text)"
        )
        op.execute(
            "DROP FUNCTION IF EXISTS fsl_worker_api.lock_member_v1(uuid)"
        )
        op.execute("DROP SCHEMA IF EXISTS fsl_worker_api")

    op.execute(
        "DELETE FROM library_notification_outbox "
        "WHERE notification_type = 'manual_review_requested'"
    )
    with op.batch_alter_table("library_notification_outbox") as batch_op:
        batch_op.drop_constraint(
            "ck_library_notification_outbox_source",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_library_notification_outbox_type",
            type_="check",
        )
        batch_op.alter_column(
            "drive_operation_id",
            existing_type=sa.Uuid(),
            nullable=False,
        )
        batch_op.alter_column(
            "access_grant_id",
            existing_type=sa.Uuid(),
            nullable=False,
        )
        batch_op.alter_column(
            "member_id",
            existing_type=sa.Uuid(),
            nullable=False,
        )
        batch_op.create_check_constraint(
            "ck_library_notification_outbox_type",
            "notification_type IN ('registration_drive_granted')",
        )
