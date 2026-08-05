from io import StringIO
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.registration_service import persist_registration
from app.schemas import EligibilityStatus
from tests.factories import student_account, student_registration


EXPECTED_TABLES = {
    "alembic_version",
    "library_access_grants",
    "library_admin_audit",
    "library_admins",
    "library_applications",
    "library_export_runs",
    "library_identities",
    "library_import_batches",
    "library_import_rows",
    "library_members",
    "library_notification_outbox",
    "library_operations",
    "library_resource_leases",
}


def test_initial_migration_upgrade_and_downgrade(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "phase5-migration.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == EXPECTED_TABLES
    audit_foreign_keys = inspector.get_foreign_keys("library_admin_audit")
    assert {
        tuple(foreign_key["constrained_columns"])
        for foreign_key in audit_foreign_keys
    } == {("admin_id",)}
    export_columns = {
        column["name"]
        for column in inspector.get_columns("library_export_runs")
    }
    assert {
        "status",
        "request_id",
        "action_key",
        "request_fingerprint",
        "byte_count",
        "snapshot_at",
        "completed_at",
        "recommended_delete_at",
        "failure_code",
    }.issubset(export_columns)
    import_row_columns = {
        column["name"]: column
        for column in inspector.get_columns("library_import_rows")
    }
    assert import_row_columns["created_at"]["default"] is not None
    member_columns = {
        column["name"]: column
        for column in inspector.get_columns("library_members")
    }
    assert "registered_at" in member_columns
    assert member_columns["normalized_email"]["nullable"] is True
    operation_columns = {
        column["name"]
        for column in inspector.get_columns("library_operations")
    }
    assert {
        "target_alias",
        "attestation_version",
        "attestation_issued_at",
        "attestation_nonce",
        "attestation_signature",
        "attestation_consumed_at",
    }.issubset(operation_columns)
    grant_columns = {
        column["name"]
        for column in inspector.get_columns("library_access_grants")
    }
    assert "target_alias" in grant_columns
    notification_columns = {
        column["name"]: column
        for column in inspector.get_columns("library_notification_outbox")
    }
    assert notification_columns["member_id"]["nullable"] is True
    assert notification_columns["access_grant_id"]["nullable"] is True
    assert notification_columns["drive_operation_id"]["nullable"] is True
    notification_checks = {
        constraint["name"]
        for constraint in inspector.get_check_constraints(
            "library_notification_outbox"
        )
    }
    assert "ck_library_notification_outbox_source" in notification_checks
    with Session(engine) as session:
        assert session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "0b1c2d3e4f5a"
    command.check(config)

    engine.dispose()
    command.downgrade(config, "c3d4e5f6a7b8")
    engine = create_engine(database_url)
    assert "attestation_signature" not in {
        column["name"]
        for column in inspect(engine).get_columns("library_operations")
    }
    engine.dispose()
    command.upgrade(config, "head")
    engine = create_engine(database_url)
    assert "attestation_signature" in {
        column["name"]
        for column in inspect(engine).get_columns("library_operations")
    }

    with Session(engine) as session:
        persisted = persist_registration(
            session,
            student_account(),
            student_registration(student_number="PP23999"),
            "migration-smoke-registration-0001",
            settings=Settings(
                database_url=database_url,
                database_url_unpooled=database_url,
                drive_resource_id="phase5-migration-smoke",
            ),
        )
    assert persisted.eligibility.status == EligibilityStatus.APPROVED

    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    engine.dispose()
    get_settings.cache_clear()


def test_confirmed_legacy_member_blocks_unsafe_email_not_null_downgrade(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "legacy-null-email-downgrade.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", database_url)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO library_members ("
                "id, normalized_email, normalized_student_number, full_name, "
                "academic_role, faculty_code, grade, member_status, "
                "record_version"
                ") VALUES ("
                ":id, NULL, NULL, 'Confirmed Legacy Member', "
                "'legacy_other', 'legacy_unknown', NULL, 'active', 1"
                ")"
            ),
            {"id": uuid4().hex},
        )
    engine.dispose()

    with pytest.raises(RuntimeError, match="preserve it before downgrade"):
        command.downgrade(config, "b2c3d4e5f6a7")

    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM library_members")) == 1
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
            "c3d4e5f6a7b8"
        )
    engine.dispose()
    get_settings.cache_clear()


def test_initial_migration_renders_postgresql_sql(monkeypatch) -> None:
    monkeypatch.setenv(
        "DATABASE_URL_UNPOOLED",
        "postgresql+psycopg://phase5:phase5@localhost/phase5",
    )
    get_settings.cache_clear()
    output = StringIO()
    config = Config("alembic.ini", output_buffer=output)

    command.upgrade(config, "head", sql=True)
    rendered_sql = output.getvalue()

    assert "SET ROLE fsl_migration" in rendered_sql
    assert "CREATE TABLE library_members" in rendered_sql
    assert "CREATE TABLE library_applications" in rendered_sql
    assert "CREATE TABLE library_operations" in rendered_sql
    assert "TIMESTAMP WITH TIME ZONE" in rendered_sql
    assert "UUID NOT NULL" in rendered_sql
    assert "library_export_runs_append_only" in rendered_sql
    assert "CREATE SCHEMA IF NOT EXISTS fsl_public_api" in rendered_sql
    assert "CREATE SCHEMA IF NOT EXISTS fsl_private" in rendered_sql
    assert "CREATE TABLE fsl_private.public_registration_rpc_keys" in rendered_sql
    assert "SECURITY DEFINER" in rendered_sql
    assert "SET search_path = pg_catalog" in rendered_sql
    assert "invalid_public_rpc_capability" in rendered_sql
    assert "pg_catalog.sha256" in rendered_sql
    assert "pg_catalog.generate_series(0, 31)" in rendered_sql
    assert "REVOKE ALL ON FUNCTION" in rendered_sql
    get_settings.cache_clear()


def test_phase9_hardening_upgrades_an_existing_empty_e0_database(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "existing-e0-empty.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", database_url)
    get_settings.cache_clear()
    config = Config("alembic.ini")

    command.upgrade(config, "e0f1a2b3c4d5")
    engine = create_engine(database_url)
    before_columns = {
        column["name"]
        for column in inspect(engine).get_columns("library_import_batches")
    }
    assert "target_drive_resource_fingerprint" not in before_columns
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(database_url)
    after_batch_columns = {
        column["name"]
        for column in inspect(engine).get_columns("library_import_batches")
    }
    after_row_columns = {
        column["name"]
        for column in inspect(engine).get_columns("library_import_rows")
    }
    assert {
        "target_drive_resource_fingerprint",
        "staged_normalized_hash",
    }.issubset(after_batch_columns)
    assert {
        "normalized_payload_hash",
        "legacy_terms_consent_recorded",
        "legacy_privacy_consent_recorded",
        "consent_version_provenance",
        "consent_timestamp_provenance",
    }.issubset(after_row_columns)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
                "0b1c2d3e4f5a"
        )
    engine.dispose()
    get_settings.cache_clear()


def test_phase9_hardening_refuses_to_invent_lineage_for_existing_batches(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "existing-e0-with-batch.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", database_url)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    command.upgrade(config, "e0f1a2b3c4d5")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO library_import_batches ("
                "id, source_type, source_hash, schema_version, "
                "normalization_rule_version, fingerprint_key_version, "
                "reference_at, source_manifest_json, dry_run_report_json, "
                "status, row_count, legal_hold, record_version"
                ") VALUES ("
                ":id, 'synthetic', :source_hash, 'legacy-v1', 'phase9-v1', "
                "'synthetic-v1', :reference_at, '{}', '{}', 'validated', "
                "0, 0, 1)"
            ),
            {
                "id": uuid4().hex,
                "source_hash": "a" * 64,
                "reference_at": "2026-08-01 00:00:00+00:00",
            },
        )
    engine.dispose()

    with pytest.raises(RuntimeError, match="preserve evidence and re-stage"):
        command.upgrade(config, "head")
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
            "e0f1a2b3c4d5"
        )
    engine.dispose()
    get_settings.cache_clear()
