"""PostgreSQL-only Phase 9/10A synthetic integration evidence.

The harness is guarded to the isolated Compose database and invokes no Google,
Drive, email, Neon, Cloud Run, or other external service.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
import hashlib
import json
import os
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from app.admin_export_service import generate_admin_member_export
from app.admin_service import AdminPrincipal
from app.config import Settings
from app.db.models import (
    LibraryAdmin,
    LibraryExportRun,
    LibraryImportBatch,
    LibraryImportRow,
    LibraryMember,
    LibraryOperation,
)
from app.db.session import create_database_engine
from app.legacy_import import (
    LegacySnapshotSource,
    LegacySourceRow,
    apply_legacy_import,
    approve_legacy_import,
    drive_resource_fingerprint,
    rollback_legacy_import,
    stage_legacy_snapshot,
)
from app.schemas import AdminExportRequest


FINGERPRINT_KEY = b"phase9-phase10a-postgres-synthetic-key-v1"
DRIVE_RESOURCE_ID = "synthetic-phase9-drive-resource"


def _guard() -> str:
    if os.environ.get("FSL_DATA_CLASSIFICATION") != "synthetic-only":
        raise RuntimeError("FSL_DATA_CLASSIFICATION=synthetic-only is required")
    if os.environ.get("FSL_PHASE9_10A_LOCAL_EVIDENCE") != "confirmed":
        raise RuntimeError("FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed is required")
    for name, expected in {
        "EXTERNAL_SIDE_EFFECTS_ENABLED": "false",
        "PHASE7_DRIVE_API_ENABLED": "false",
        "PHASE7_DRIVE_KILL_SWITCH": "true",
    }.items():
        if os.environ.get(name, "").lower() != expected:
            raise RuntimeError(f"{name} must be {expected}")
    value = os.environ.get("DATABASE_URL", "").strip()
    normalized = value.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlsplit(normalized)
    if (
        parsed.scheme != "postgresql"
        or parsed.hostname != "db"
        or parsed.path != "/compass_library_dev"
        or parsed.username != "compass_library_dev"
    ):
        raise RuntimeError("isolated Compose PostgreSQL URL is required")
    return value


def _sources(email: str, student_number: str) -> dict[str, LegacySnapshotSource]:
    common = {
        "氏名": "SYNTHETIC PHASE9 USER",
        "学年": "1年",
        "学籍番号": student_number,
        "自動収集メール": email,
        "所属学部": "pharmacy",
        "利用規約": "理解しました",
        "個人情報": "理解しました",
    }
    management = {
        **common,
        "入力メール": email,
        "招待対象メール": email,
        "利用規約回答": "理解しました",
        "個人情報回答": "理解しました",
    }
    drive = {
        "id": f"permission-{uuid4()}",
        "emailAddress": email,
        "role": "reader",
        "type": "user",
    }
    payloads = {
        "google_form": common,
        "management_sheet": management,
        "drive_permission": drive,
    }
    return {
        source: LegacySnapshotSource(
            snapshot_bytes=json.dumps(
                payload,
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8"),
            rows=[LegacySourceRow(2, payload)],
        )
        for source, payload in payloads.items()
    }


def _cleanup_stale_synthetic_batches(
    factory: sessionmaker[Session],
) -> None:
    """Recover only this harness's interrupted prior synthetic run."""

    with factory() as session:
        batches = list(
            session.scalars(
                select(LibraryImportBatch).where(
                    LibraryImportBatch.fingerprint_key_version
                    == "postgres-synthetic-v1"
                )
            )
        )
        for batch in batches:
            emails = {
                str(row.normalized_payload.get("normalized_email"))
                for row in batch.rows
                if row.normalized_payload.get("normalized_email")
            }
            if not emails or any(
                not email.startswith("phase9-10a-")
                or not email.endswith("@st.kitasato-u.ac.jp")
                for email in emails
            ):
                raise RuntimeError("refusing to clean a non-harness Phase 9 batch")
            if batch.status == "applied":
                if batch.approved_by_admin_id is None:
                    raise RuntimeError("stale synthetic batch has no approving admin")
                rollback_legacy_import(
                    session,
                    batch.id,
                    rolled_back_by_admin_id=batch.approved_by_admin_id,
                    reason="Interrupted PostgreSQL synthetic evidence cleanup.",
                    fingerprint_key=FINGERPRINT_KEY,
                )
                batch = session.get(LibraryImportBatch, batch.id)
            session.delete(batch)
            session.commit()


def main() -> None:
    database_url = _guard()
    settings = Settings(
        app_env="docker-phase9-10a-synthetic",
        database_url=database_url,
        database_url_unpooled=database_url,
        db_pool_size=2,
        db_max_overflow=0,
        external_side_effects_enabled=False,
        phase7_drive_api_enabled=False,
        phase7_drive_kill_switch=True,
        drive_resource_id=DRIVE_RESOURCE_ID,
        pii_logging_enabled=False,
        phase8_admin_api_enabled=True,
        phase10a_export_api_enabled=True,
        phase10a_export_max_rows=5_000,
    )
    engine = create_database_engine(settings)
    factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    suffix = uuid4().hex
    email = f"phase9-10a-{suffix}@st.kitasato-u.ac.jp"
    student_number = f"PP{int(suffix[:8], 16) % 100000:05d}"

    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT current_database()")) == (
                "compass_library_dev"
            )
            assert connection.scalar(
                text("SELECT version_num FROM alembic_version")
            ) == "e9f0a1b2c3d4"

        _cleanup_stale_synthetic_batches(factory)
        if os.environ.get("FSL_PHASE9_10A_CLEANUP_ONLY") == "confirmed":
            print(
                '{"status":"pass","classification":"synthetic-only",'
                '"cleanup":"completed"}'
            )
            return

        with factory() as session:
            while session.scalar(
                select(LibraryMember.id).where(
                    LibraryMember.normalized_student_number == student_number
                )
            ) is not None:
                suffix = uuid4().hex
                student_number = f"PP{int(suffix[:8], 16) % 100000:05d}"
            admin = LibraryAdmin(
                google_sub=f"phase9-10a-admin-{uuid4()}",
                role="admin",
                active=True,
            )
            session.add(admin)
            session.commit()
            admin_id = admin.id
            staged = stage_legacy_snapshot(
                session,
                reference_at=datetime.now(UTC),
                sources=_sources(email, student_number),
                fingerprint_key=FINGERPRINT_KEY,
                fingerprint_key_version="postgres-synthetic-v1",
                drive_resource_id=DRIVE_RESOURCE_ID,
                expected_drive_resource_fingerprint=drive_resource_fingerprint(
                    FINGERPRINT_KEY,
                    DRIVE_RESOURCE_ID,
                ),
            )
            assert staged.report["classification_counts"] == {
                "ready": 3,
                "manual_resolution": 0,
                "excluded": 0,
            }
            assert staged.report["reconciliation_counts"]["both"] == 1
            approve_legacy_import(
                session,
                staged.batch_id,
                approved_by_admin_id=admin_id,
                reason="PostgreSQL synthetic dry-run reviewed and approved.",
                idempotency_key=f"approve-{uuid4()}",
                fingerprint_key=FINGERPRINT_KEY,
            )
            batch_id = staged.batch_id

        def apply_once():
            with factory() as concurrent_session:
                return apply_legacy_import(
                    concurrent_session,
                    batch_id,
                    drive_resource_id=DRIVE_RESOURCE_ID,
                    fingerprint_key=FINGERPRINT_KEY,
                )

        with ThreadPoolExecutor(max_workers=2) as executor:
            concurrent_results = list(executor.map(lambda _index: apply_once(), range(2)))
        applied_results = [result for result in concurrent_results if not result.replayed]
        assert len(applied_results) == 1
        assert applied_results[0].created_members == 1
        assert sum(1 for result in concurrent_results if result.replayed) == 1

        with factory() as session:
            member = session.scalar(
                select(LibraryMember).where(
                    LibraryMember.normalized_email == email
                )
            )
            assert member is not None
            member_id = member.id
            assert session.scalar(
                select(func.count())
                .select_from(LibraryOperation)
                .where(LibraryOperation.member_id == member.id)
            ) == 0
            principal = AdminPrincipal(admin_id=admin_id, role="admin")
            csv_export = generate_admin_member_export(
                session,
                settings,
                principal,
                AdminExportRequest(
                    format="csv",
                    member_status="active",
                    academic_role=None,
                    purpose_code="periodic_roster_review",
                    confirmed=True,
                ),
                idempotency_key=f"csv-{uuid4()}",
                request_id=str(uuid4()),
            )
            assert hashlib.sha256(csv_export.artifact.content).hexdigest() == (
                csv_export.artifact.manifest.sha256
            )
            xlsx_export = generate_admin_member_export(
                session,
                settings,
                principal,
                AdminExportRequest(
                    format="xlsx",
                    member_status="active",
                    academic_role=None,
                    purpose_code="periodic_roster_review",
                    confirmed=True,
                ),
                idempotency_key=f"xlsx-{uuid4()}",
                request_id=str(uuid4()),
            )
            assert xlsx_export.artifact.content.startswith(b"PK")
            export_run_id = csv_export.export_run_id

        raw_trigger_blocked = False
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE library_import_rows SET source_payload = '{}'::json "
                        "WHERE batch_id = :batch_id"
                    ),
                    {"batch_id": batch_id},
                )
        except DBAPIError:
            raw_trigger_blocked = True
        assert raw_trigger_blocked

        export_trigger_blocked = False
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE library_export_runs SET status = 'failed' "
                        "WHERE id = :run_id"
                    ),
                    {"run_id": export_run_id},
                )
        except DBAPIError:
            export_trigger_blocked = True
        assert export_trigger_blocked

        with factory() as session:
            assert session.get(LibraryExportRun, export_run_id).status == "generated"
            rollback_legacy_import(
                session,
                batch_id,
                rolled_back_by_admin_id=admin_id,
                reason="PostgreSQL synthetic rollback and re-import evidence.",
                fingerprint_key=FINGERPRINT_KEY,
            )
            assert session.get(LibraryMember, member_id) is None
            approve_legacy_import(
                session,
                batch_id,
                approved_by_admin_id=admin_id,
                reason="PostgreSQL synthetic re-import reviewed and approved.",
                idempotency_key=f"reapprove-{uuid4()}",
                fingerprint_key=FINGERPRINT_KEY,
            )
            reapplied = apply_legacy_import(
                session,
                batch_id,
                drive_resource_id=DRIVE_RESOURCE_ID,
                fingerprint_key=FINGERPRINT_KEY,
            )
            assert reapplied.created_members == 1
            assert session.scalar(
                select(func.count())
                .select_from(LibraryMember)
                .where(LibraryMember.normalized_email == email)
            ) == 1
            rollback_legacy_import(
                session,
                batch_id,
                rolled_back_by_admin_id=admin_id,
                reason="PostgreSQL synthetic final cleanup rollback evidence.",
                fingerprint_key=FINGERPRINT_KEY,
            )
            assert session.scalar(
                select(func.count())
                .select_from(LibraryMember)
                .where(LibraryMember.normalized_email == email)
            ) == 0
            batch = session.get(LibraryImportBatch, batch_id)
            apply_counts = {
                status: sum(
                    1 for row in batch.rows if row.apply_status == status
                )
                for status in ("pending", "applied", "skipped", "rolled_back")
            }
            assert sum(apply_counts.values()) == batch.row_count
            assert session.scalar(
                select(func.count())
                .select_from(LibraryImportRow)
                .where(LibraryImportRow.batch_id == batch_id)
            ) == 3
            # Leave the reusable local schema free of Phase 9 rows so the next
            # downgrade/re-upgrade rehearsal remains possible. Append-only
            # admin/export audits intentionally remain as synthetic evidence.
            session.delete(batch)
            session.commit()

        print(
            json.dumps(
                {
                    "status": "pass",
                    "classification": "synthetic-only",
                    "schema_head": "e9f0a1b2c3d4",
                    "phase9_rows": 3,
                    "concurrent_apply_workers": 2,
                    "duplicate_members": 0,
                    "duplicate_permissions": 0,
                    "drive_operations_created": 0,
                    "rollback_reimport": "pass",
                    "raw_snapshot_trigger": "pass",
                    "export_append_only_trigger": "pass",
                    "csv_sha256": "pass",
                    "xlsx_generated": "pass",
                    "external_side_effects": False,
                    "remote_services_contacted": False,
                },
                separators=(",", ":"),
            )
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
