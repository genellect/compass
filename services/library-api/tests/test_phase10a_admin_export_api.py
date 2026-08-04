from __future__ import annotations

from collections.abc import Iterator
import csv
from datetime import UTC, datetime
import hashlib
import io
import zipfile

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryAdmin,
    LibraryAdminAudit,
    LibraryExportRun,
    LibraryMember,
)
from app.db.session import get_session
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.main import app, get_admin_google_token_verifier


ADMIN_IDENTITY = VerifiedGoogleIdentity(
    google_sub="phase10a-admin-sub",
    email="admin@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase10a-admin-client-id",
)


class FakeVerifier:
    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-admin-token"
        return ADMIN_IDENTITY


def _settings(**updates: object) -> Settings:
    values: dict[str, object] = {
        "phase6_auth_api_enabled": True,
        "phase8_admin_api_enabled": True,
        "phase10a_export_api_enabled": True,
        "google_oauth_client_ids": "phase10a-client-id",
        "google_admin_oauth_client_ids": "phase10a-admin-client-id",
        "allowed_google_hosted_domains": "st.kitasato-u.ac.jp",
        "drive_resource_id": "phase10a-synthetic-drive",
    }
    values.update(updates)
    return Settings(**values)


def _configure(engine) -> sessionmaker[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_admin_google_token_verifier] = FakeVerifier
    return factory


def _headers(key: str = "phase10a-export-0001") -> dict[str, str]:
    return {
        "Authorization": "Bearer synthetic-admin-token",
        "Idempotency-Key": key,
    }


def _payload(export_format: str = "csv") -> dict[str, object]:
    return {
        "format": export_format,
        "memberStatus": "active",
        "academicRole": None,
        "purposeCode": "periodic_roster_review",
        "confirmed": True,
    }


def _seed(
    session: Session,
    *,
    role: str = "admin",
    member_count: int = 1,
) -> None:
    session.add(
        LibraryAdmin(
            google_sub=ADMIN_IDENTITY.google_sub,
            role=role,
            active=True,
        )
    )
    for index in range(member_count):
        member = LibraryMember(
            normalized_email=f"synthetic-{index}@example.invalid",
            normalized_student_number=f"PP{index:05d}",
            full_name=" \t=HYPERLINK(\"https://example.invalid\")" if index == 0 else f"合成 利用者{index}",
            academic_role="undergraduate",
            faculty_code="pharmacy",
            grade="1",
            member_status="active",
        )
        session.add(member)
        session.flush()
        session.add(
            LibraryAccessGrant(
                member_id=member.id,
                resource_id=DRIVE_TARGET_ALIAS,
                target_alias=DRIVE_TARGET_ALIAS,
                role="reader",
                status="already_granted",
                managed_by_system=False,
                notification_status="not_applicable",
            )
        )
    session.commit()


def test_admin_csv_export_is_memory_only_audited_and_idempotent(
    engine,
    monkeypatch,
) -> None:
    settings = _settings()
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        _seed(session)

    client = TestClient(app)
    response = client.post(
        "/admin/v1/exports",
        headers=_headers(),
        json=_payload("csv"),
    )
    replay = client.post(
        "/admin/v1/exports",
        headers=_headers(),
        json=_payload("csv"),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert replay.status_code == 409
    assert replay.json() == {"detail": "export_already_generated"}
    assert response.content.startswith(b"\xef\xbb\xbf")
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"].startswith(
        'attachment; filename="library-members-'
    )
    assert "example.invalid" not in response.headers["content-disposition"]
    assert response.headers["x-export-row-count"] == "1"
    assert response.headers["x-content-sha256"] == hashlib.sha256(
        response.content
    ).hexdigest()

    records = list(
        csv.reader(io.StringIO(response.content.decode("utf-8-sig")))
    )
    assert records[0][0:4] == [
        "full_name",
        "roster_grade",
        "student_number",
        "registered_at_utc",
    ]
    columns = {name: index for index, name in enumerate(records[0])}
    assert records[1][columns["full_name"]].startswith("'")
    assert records[1][columns["student_number"]] == "PP00000"
    assert records[1][columns["drive_access_status"]] == "already_granted"
    assert records[1][columns["drive_permission_managed"]] == "false"

    with factory() as session:
        runs = list(session.scalars(select(LibraryExportRun)))
        audits = list(session.scalars(select(LibraryAdminAudit)))
    assert len(runs) == 1
    assert runs[0].status == "generated"
    assert runs[0].content_hash == hashlib.sha256(response.content).hexdigest()
    assert runs[0].byte_count == len(response.content)
    assert runs[0].filters_json == {"member_status": "active"}
    assert not hasattr(runs[0], "content")
    assert [audit.action for audit in audits] == ["member_export_generated"]
    assert audits[0].reason == "export_purpose:periodic_roster_review"
    assert audits[0].metadata_json["purpose_code"] == (
        "periodic_roster_review"
    )
    assert "synthetic-0@example.invalid" not in str(audits[0].metadata_json)


def test_admin_xlsx_export_contains_text_cells_and_no_active_content(
    engine,
    monkeypatch,
) -> None:
    settings = _settings()
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        _seed(session)

    response = TestClient(app).post(
        "/admin/v1/exports",
        headers=_headers("phase10a-export-xlsx"),
        json=_payload("xlsx"),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    with zipfile.ZipFile(io.BytesIO(response.content)) as workbook:
        names = set(workbook.namelist())
        members_xml = workbook.read("xl/worksheets/sheet1.xml").decode()
        all_xml = "\n".join(
            workbook.read(name).decode(errors="replace")
            for name in names
            if name.endswith((".xml", ".rels"))
        )
    assert "xl/vbaProject.bin" not in names
    assert not any("externalLink" in name for name in names)
    assert "<f" not in members_xml
    assert "<hyperlink" not in members_xml
    assert 't="inlineStr"' in members_xml
    assert "HYPERLINK" in members_xml
    assert "mailto:" not in all_xml


@pytest.mark.parametrize("role", ["viewer", "operator"])
def test_non_admin_roles_cannot_export(engine, monkeypatch, role: str) -> None:
    settings = _settings()
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        _seed(session, role=role)

    response = TestClient(app).post(
        "/admin/v1/exports",
        headers=_headers(f"phase10a-forbidden-{role}"),
        json=_payload(),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    with factory() as session:
        assert session.scalar(select(LibraryExportRun)) is None


def test_disabled_export_is_not_discoverable(engine, monkeypatch) -> None:
    settings = _settings(phase10a_export_api_enabled=False)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        _seed(session)

    response = TestClient(app).post(
        "/admin/v1/exports",
        headers=_headers("phase10a-disabled"),
        json=_payload(),
    )
    app.dependency_overrides.clear()
    assert response.status_code == 404


def test_disabled_export_returns_404_before_auth_or_database(
    monkeypatch,
) -> None:
    settings = _settings(phase10a_export_api_enabled=False)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)

    response = TestClient(app).post(
        "/admin/v1/exports",
        json=_payload(),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


def test_row_limit_failure_is_recorded_without_file_content(
    engine,
    monkeypatch,
) -> None:
    settings = _settings(phase10a_export_max_rows=1)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        _seed(session, member_count=2)

    response = TestClient(app).post(
        "/admin/v1/exports",
        headers=_headers("phase10a-row-limit"),
        json=_payload(),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 413
    assert response.json() == {"detail": "export_row_limit_exceeded"}
    with factory() as session:
        run = session.scalar(select(LibraryExportRun))
        audit = session.scalar(select(LibraryAdminAudit))
    assert run is not None and run.status == "failed"
    assert run.content_hash is None and run.byte_count == 0
    assert audit is not None and audit.action == "member_export_failed"


def test_export_request_rejects_free_text_unknown_purpose_and_unconfirmed_release(
    engine,
    monkeypatch,
) -> None:
    settings = _settings()
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        _seed(session)

    client = TestClient(app)
    free_text_filter = client.post(
        "/admin/v1/exports",
        headers=_headers("phase10a-unknown-filter"),
        json={**_payload(), "email": "synthetic@example.invalid"},
    )
    free_text_reason = client.post(
        "/admin/v1/exports",
        headers=_headers("phase10a-free-text-reason"),
        json={
            **_payload(),
            "reason": "A person-specific export note must not be accepted.",
        },
    )
    unknown_purpose = client.post(
        "/admin/v1/exports",
        headers=_headers("phase10a-unknown-purpose"),
        json={**_payload(), "purposeCode": "person_specific_request"},
    )
    unconfirmed = client.post(
        "/admin/v1/exports",
        headers=_headers("phase10a-unconfirmed"),
        json={**_payload(), "confirmed": False},
    )
    app.dependency_overrides.clear()

    assert free_text_filter.status_code == 422
    assert free_text_reason.status_code == 422
    assert unknown_purpose.status_code == 422
    assert unconfirmed.status_code == 422
    with factory() as session:
        assert session.scalar(select(LibraryExportRun)) is None


def test_export_audit_status_and_payload_must_be_consistent(engine) -> None:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    now = datetime.now(UTC)
    with factory() as session:
        session.add(
            LibraryExportRun(
                schema_version="library-members-v2",
                export_format="csv",
                status="generated",
                request_id="synthetic-request",
                action_key="a" * 64,
                request_fingerprint="b" * 64,
                row_count=0,
                byte_count=0,
                content_hash=None,
                filters_json={},
                snapshot_at=now,
                completed_at=now,
                recommended_delete_at=now,
                failure_code=None,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
