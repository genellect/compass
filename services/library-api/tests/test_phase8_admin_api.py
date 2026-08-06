from collections.abc import Iterator
from datetime import UTC, datetime

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryAdmin,
    LibraryAdminAudit,
    LibraryApplication,
    LibraryMember,
    LibraryOperation,
)
from app.db.session import get_session
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.main import (
    app,
    get_admin_google_token_verifier,
    get_google_token_verifier,
)
from app.registration_service import persist_registration
from app.schemas import AccountFacts, RegistrationInput
from scripts.bootstrap_phase8_admin import (
    AdminBootstrapConflict,
    create_bootstrap_admin,
)
from tests.factories import student_registration


SETTINGS = Settings(
    phase6_auth_api_enabled=True,
    phase8_admin_api_enabled=True,
    admin_mutations_enabled=True,
    google_oauth_client_ids="phase8-client-id",
    google_admin_oauth_client_ids="phase8-admin-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    drive_resource_id="phase8-synthetic-drive",
)
ADMIN_IDENTITY = VerifiedGoogleIdentity(
    google_sub="phase8-admin-sub",
    email="admin@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase8-admin-client-id",
)
APPLICANT_IDENTITY = VerifiedGoogleIdentity(
    google_sub="phase8-applicant-sub",
    email="applicant@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase8-client-id",
)
WORKSPACE_IDENTITY = VerifiedGoogleIdentity(
    google_sub="phase8-workspace-member-sub",
    email="member@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase8-admin-client-id",
)


class FakeVerifier:
    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-admin-token"
        return ADMIN_IDENTITY


class WorkspaceVerifier:
    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-workspace-token"
        return WORKSPACE_IDENTITY


def _configure(
    engine,
    *,
    admin_verifier=FakeVerifier,
) -> sessionmaker[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_google_token_verifier] = FakeVerifier
    app.dependency_overrides[get_admin_google_token_verifier] = admin_verifier
    return factory


def _headers(key: str | None = None) -> dict[str, str]:
    headers = {"Authorization": "Bearer synthetic-admin-token"}
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _seed_manual_application(
    session: Session,
    *,
    faculty: str = "pharmacy",
) -> LibraryApplication:
    result = persist_registration(
        session,
        AccountFacts(
            verified=True,
            token_valid=True,
            email_verified=True,
            email=APPLICANT_IDENTITY.email,
            hosted_domain="st.kitasato-u.ac.jp",
            allowed_hosted_domains=["st.kitasato-u.ac.jp"],
        ),
        RegistrationInput(
            full_name="Synthetic Staff",
            academic_role="staff",
            faculty=faculty,
            grade="",
            student_number="",
            terms_accepted=False,
            privacy_accepted=True,
            question="",
        ),
        f"phase8-manual-{faculty}",
        settings=SETTINGS,
        identity=APPLICANT_IDENTITY,
        source="phase8_test",
    )
    assert result.application_id is not None
    application = session.get(LibraryApplication, result.application_id)
    assert application is not None
    return application


def test_admin_manual_approval_enqueues_one_grant_and_audits(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="operator",
                active=True,
            )
        )
        application = _seed_manual_application(session)
        application_id = application.id
        version = application.record_version
        session.commit()

    client = TestClient(app)
    response = client.post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-approve-0001"),
        json={
            "decision": "approve",
            "reason": "Verified pharmacy staff registration.",
            "expectedRecordVersion": version,
        },
    )
    replay = client.post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-approve-0001"),
        json={
            "decision": "approve",
            "reason": "Verified pharmacy staff registration.",
            "expectedRecordVersion": version,
        },
    )
    mismatched_replay = client.post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-approve-0001"),
        json={
            "decision": "reject",
            "reason": "A different action must not reuse the same key.",
            "expectedRecordVersion": version,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert replay.status_code == 200
    assert mismatched_replay.status_code == 409
    assert mismatched_replay.json() == {
        "detail": "idempotency_payload_mismatch"
    }
    assert response.json()["status"] == "approved"
    with factory() as session:
        application = session.get(LibraryApplication, application_id)
        assert application is not None
        assert application.eligibility_status == "manual_review"
        assert application.admin_decision == "approved"
        assert session.scalar(select(LibraryAccessGrant)) is not None
        operations = list(session.scalars(select(LibraryOperation)))
        assert len(operations) == 1
        assert operations[0].attestation_version == "v1"
        assert len(operations[0].attestation_signature or "") == 64
        assert len(list(session.scalars(select(LibraryAdminAudit)))) == 1


def test_admin_cannot_approve_non_pharmacy_or_stale_record(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="operator",
                active=True,
            )
        )
        application = _seed_manual_application(session, faculty="other")
        application_id = application.id
        version = application.record_version
        session.commit()

    response = TestClient(app).post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-forbidden-approve"),
        json={
            "decision": "approve",
            "reason": "This must remain blocked by fixed logic.",
            "expectedRecordVersion": version,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json() == {"detail": "manual_approval_not_permitted"}


def test_viewer_can_read_but_cannot_mutate(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="viewer",
                active=True,
            )
        )
        application = _seed_manual_application(session)
        application_id = application.id
        version = application.record_version
        session.commit()

    client = TestClient(app)
    listing = client.get("/admin/v1/applications", headers=_headers())
    decision = client.post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-viewer-denied"),
        json={
            "decision": "reject",
            "reason": "Viewer must not mutate application state.",
            "expectedRecordVersion": version,
        },
    )
    app.dependency_overrides.clear()

    assert listing.status_code == 200
    assert listing.json()["items"][0]["email"] == APPLICANT_IDENTITY.email
    assert listing.json()["items"][0]["drivePermissionManaged"] is False
    assert decision.status_code == 403


def test_admin_revoke_rejects_unmanaged_permission(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="admin",
                active=True,
            )
        )
        member = LibraryMember(
            normalized_email="member@st.kitasato-u.ac.jp",
            full_name="Synthetic Member",
            academic_role="staff",
            faculty_code="pharmacy",
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
        member_id = member.id
        version = member.record_version

    response = TestClient(app).post(
        f"/admin/v1/members/{member_id}/revoke",
        headers=_headers("phase8-unmanaged-revoke"),
        json={
            "reason": "Attempted safe revoke of unmanaged permission.",
            "expectedRecordVersion": version,
            "confirmedMemberId": str(member_id),
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json() == {"detail": "permission_not_managed"}


def test_rejecting_conflict_does_not_deactivate_existing_active_member(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    account = AccountFacts(
        verified=True,
        token_valid=True,
        email_verified=True,
        email=APPLICANT_IDENTITY.email,
        hosted_domain="st.kitasato-u.ac.jp",
        allowed_hosted_domains=["st.kitasato-u.ac.jp"],
    )
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="operator",
                active=True,
            )
        )
        first = persist_registration(
            session,
            account,
            student_registration(student_number="PP23001"),
            "phase8-existing-member",
            settings=SETTINGS,
            identity=APPLICANT_IDENTITY,
        )
        conflict = persist_registration(
            session,
            account,
            student_registration(student_number="PP23002"),
            "phase8-existing-conflict",
            settings=SETTINGS,
            identity=APPLICANT_IDENTITY,
        )
        application = session.get(LibraryApplication, conflict.application_id)
        assert application is not None
        application_id = application.id
        version = application.record_version
        member_id = first.member_id

    response = TestClient(app).post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-reject-conflict"),
        json={
            "decision": "reject",
            "reason": "Preserve the existing verified member record.",
            "expectedRecordVersion": version,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    with factory() as session:
        member = session.get(LibraryMember, member_id)
        assert member is not None
        assert member.member_status == "active"


def test_admin_pii_search_uses_post_body_and_get_contract_has_no_q(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="viewer",
                active=True,
            )
        )
        _seed_manual_application(session)
        session.commit()

    client = TestClient(app)
    response = client.post(
        "/admin/v1/applications/search",
        headers=_headers(),
        json={
            "q": "Synthetic Staff",
            "decision": "pending",
            "driveStatus": "not_enqueued",
            "offset": 0,
            "limit": 10,
        },
    )
    get_parameters = app.openapi()["paths"]["/admin/v1/applications"]["get"].get(
        "parameters",
        [],
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["items"][0]["email"] == APPLICANT_IDENTITY.email
    assert response.json()["items"][0]["drivePermissionManaged"] is False
    assert "q" not in {parameter["name"] for parameter in get_parameters}


def test_admin_roster_uses_canonical_grades_nullable_fields_and_server_sorting(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="viewer",
                active=True,
            )
        )
        session.add_all(
            [
                LibraryMember(
                    normalized_email="year4@st.kitasato-u.ac.jp",
                    normalized_student_number="PP24002",
                    full_name="Synthetic Year Four",
                    academic_role="undergraduate",
                    faculty_code="pharmacy",
                    grade="4",
                    registered_at=datetime(2026, 7, 2, tzinfo=UTC),
                    member_status="active",
                ),
                LibraryMember(
                    normalized_email="year1@st.kitasato-u.ac.jp",
                    normalized_student_number="PP24001",
                    full_name="Synthetic Year One",
                    academic_role="undergraduate",
                    faculty_code="pharmacy",
                    grade="1",
                    registered_at=datetime(2026, 7, 1, tzinfo=UTC),
                    member_status="active",
                ),
                LibraryMember(
                    normalized_email="master1@st.kitasato-u.ac.jp",
                    normalized_student_number="MP24001",
                    full_name="Synthetic Master One",
                    academic_role="master",
                    faculty_code="pharmacy",
                    grade="1",
                    registered_at=datetime(2026, 7, 3, tzinfo=UTC),
                    member_status="active",
                ),
                LibraryMember(
                    normalized_email="legacy@st.kitasato-u.ac.jp",
                    normalized_student_number=None,
                    full_name="Synthetic Legacy Member",
                    academic_role="other",
                    faculty_code="pharmacy",
                    grade=None,
                    registered_at=None,
                    member_status="active",
                ),
            ]
        )
        session.commit()

    client = TestClient(app)
    by_grade = client.post(
        "/admin/v1/members/search",
        headers=_headers(),
        json={
            "memberStatus": "active",
            "sortBy": "grade",
            "sortDirection": "asc",
            "offset": 0,
            "limit": 25,
        },
    )
    by_date = client.post(
        "/admin/v1/members/search",
        headers=_headers(),
        json={
            "memberStatus": "active",
            "sortBy": "registered_at",
            "sortDirection": "desc",
            "offset": 0,
            "limit": 25,
        },
    )
    app.dependency_overrides.clear()

    assert by_grade.status_code == 200
    assert [item["grade"] for item in by_grade.json()["items"]] == [
        "1年",
        "4年",
        "M1",
        "その他",
    ]
    legacy = by_grade.json()["items"][-1]
    assert legacy["studentNumber"] is None
    assert legacy["registeredAt"] is None
    assert by_date.status_code == 200
    assert [item["fullName"] for item in by_date.json()["items"]] == [
        "Synthetic Master One",
        "Synthetic Year Four",
        "Synthetic Year One",
        "Synthetic Legacy Member",
    ]


def test_admin_reason_requires_eight_non_whitespace_characters(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="operator",
                active=True,
            )
        )
        application = _seed_manual_application(session)
        application_id = application.id
        version = application.record_version
        session.commit()

    response = TestClient(app).post(
        f"/admin/v1/applications/{application_id}/decision",
        headers=_headers("phase8-blank-reason"),
        json={
            "decision": "approve",
            "reason": "        ",
            "expectedRecordVersion": version,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 422
    with factory() as session:
        assert session.scalar(select(LibraryAdminAudit)) is None


def test_drive_revoke_deactivates_member_and_queues_permission_removal(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="admin",
                active=True,
            )
        )
        member = LibraryMember(
            normalized_email="managed@st.kitasato-u.ac.jp",
            full_name="Managed Member",
            academic_role="staff",
            faculty_code="pharmacy",
            member_status="active",
        )
        session.add(member)
        session.flush()
        session.add(
            LibraryAccessGrant(
                member_id=member.id,
                resource_id=DRIVE_TARGET_ALIAS,
                target_alias=DRIVE_TARGET_ALIAS,
                permission_id="phase8-managed-permission",
                role="reader",
                status="granted",
                managed_by_system=True,
                notification_status="sent_by_drive",
            )
        )
        session.commit()
        member_id = member.id
        version = member.record_version

    response = TestClient(app).post(
        f"/admin/v1/members/{member_id}/revoke",
        headers=_headers("phase8-managed-revoke"),
        json={
            "reason": "Deactivate membership and remove the managed permission.",
            "expectedRecordVersion": version,
            "confirmedMemberId": str(member_id),
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    with factory() as session:
        member = session.get(LibraryMember, member_id)
        assert member is not None
        assert member.member_status == "inactive"
        assert member.deactivated_at is not None
        operation = session.scalar(
            select(LibraryOperation).where(
                LibraryOperation.operation_type == "drive_revoke"
            )
        )
        assert operation is not None
        assert operation.status == "pending"
        assert operation.attestation_version == "v1"
        assert len(operation.attestation_signature or "") == 64
        audit = session.scalar(select(LibraryAdminAudit))
        assert audit is not None
        assert audit.action == "member_deactivate_and_revoke"


def test_deactivate_cancels_pending_and_failed_grants(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="admin",
                active=True,
            )
        )
        member = LibraryMember(
            normalized_email="deactivate@st.kitasato-u.ac.jp",
            full_name="Deactivated Member",
            academic_role="staff",
            faculty_code="pharmacy",
            member_status="active",
        )
        session.add(member)
        session.flush()
        session.add_all(
            [
                LibraryAccessGrant(
                    member_id=member.id,
                    resource_id="phase8-pending-resource",
                    role="reader",
                    status="pending",
                    managed_by_system=False,
                    notification_status="pending",
                ),
                LibraryAccessGrant(
                    member_id=member.id,
                    resource_id="phase8-failed-resource",
                    role="reader",
                    status="failed",
                    managed_by_system=False,
                    notification_status="failed",
                ),
                LibraryOperation(
                    member_id=member.id,
                    operation_key="phase8-pending-grant",
                    operation_type="drive_grant",
                    resource_id="phase8-pending-resource",
                    status="pending",
                    max_attempts=3,
                ),
                LibraryOperation(
                    member_id=member.id,
                    operation_key="phase8-failed-grant",
                    operation_type="drive_grant",
                    resource_id="phase8-failed-resource",
                    status="failed",
                    error_code="temporary_failure",
                    max_attempts=3,
                ),
            ]
        )
        session.commit()
        member_id = member.id
        version = member.record_version

    client = TestClient(app)
    body = {
        "reason": "Deactivate this local library membership.",
        "expectedRecordVersion": version,
        "confirmedMemberId": str(member_id),
    }
    response = client.post(
        f"/admin/v1/members/{member_id}/deactivate",
        headers=_headers("phase8-deactivate-member"),
        json=body,
    )
    replay = client.post(
        f"/admin/v1/members/{member_id}/deactivate",
        headers=_headers("phase8-deactivate-member"),
        json=body,
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert replay.status_code == 200
    assert response.json()["status"] == "inactive"
    with factory() as session:
        member = session.get(LibraryMember, member_id)
        assert member is not None
        assert member.member_status == "inactive"
        operations = list(
            session.scalars(
                select(LibraryOperation).order_by(LibraryOperation.operation_key)
            )
        )
        assert len(operations) == 2
        assert all(operation.status == "dead" for operation in operations)
        assert all(
            operation.error_code == "member_inactive" for operation in operations
        )
        assert all(operation.completed_at is not None for operation in operations)
        grants = list(session.scalars(select(LibraryAccessGrant)))
        assert all(grant.status == "failed" for grant in grants)
        audits = list(session.scalars(select(LibraryAdminAudit)))
        assert len(audits) == 1
        assert audits[0].action == "member_deactivate"
        assert audits[0].metadata_json["cancelled_grant_count"] == 2


def test_subject_rate_limit_denial_does_not_consume_global_quota(
    engine,
    monkeypatch,
) -> None:
    class StubRateLimiter:
        def __init__(self, allowed: bool) -> None:
            self.allowed = allowed
            self.keys: list[str] = []

        def allow(
            self,
            key: str,
            *,
            limit: int,
            window_seconds: int,
        ) -> tuple[bool, int]:
            del limit, window_seconds
            self.keys.append(key)
            return self.allowed, 60

    subject_limiter = StubRateLimiter(False)
    global_limiter = StubRateLimiter(True)
    settings = SETTINGS.model_copy(update={"rate_limits_enabled": True})
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.submit_rate_limiter", subject_limiter)
    monkeypatch.setattr("app.main.submit_global_rate_limiter", global_limiter)
    _configure(engine)

    response = TestClient(app).post(
        "/phase6/registrations",
        headers=_headers("phase8-rate-limit-order"),
        json={
            "registration": student_registration().model_dump(by_alias=True)
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 429
    assert subject_limiter.keys == [ADMIN_IDENTITY.subject_hash]
    assert global_limiter.keys == []


def test_every_admin_v1_route_rejects_missing_auth_and_workspace_non_admin(
    engine,
    monkeypatch,
) -> None:
    fixed_id = "11111111-1111-4111-8111-111111111111"
    route_cases = [
        ("GET", "/admin/v1/session", "/admin/v1/session", None),
        (
            "GET",
            "/admin/v1/applications",
            "/admin/v1/applications",
            None,
        ),
        (
            "POST",
            "/admin/v1/applications/search",
            "/admin/v1/applications/search",
            {},
        ),
        (
            "POST",
            "/admin/v1/members/search",
            "/admin/v1/members/search",
            {},
        ),
        (
            "GET",
            "/admin/v1/applications/{application_id}",
            f"/admin/v1/applications/{fixed_id}",
            None,
        ),
        (
            "POST",
            "/admin/v1/applications/{application_id}/decision",
            f"/admin/v1/applications/{fixed_id}/decision",
            {
                "decision": "reject",
                "reason": "Inventory authorization boundary check.",
                "expectedRecordVersion": 1,
            },
        ),
        (
            "POST",
            "/admin/v1/operations/{operation_id}/retry",
            f"/admin/v1/operations/{fixed_id}/retry",
            {
                "reason": "Inventory authorization boundary check.",
                "expectedRecordVersion": 1,
            },
        ),
        (
            "POST",
            "/admin/v1/members/{member_id}/revoke",
            f"/admin/v1/members/{fixed_id}/revoke",
            {
                "reason": "Inventory authorization boundary check.",
                "expectedRecordVersion": 1,
                "confirmedMemberId": fixed_id,
            },
        ),
        (
            "POST",
            "/admin/v1/members/{member_id}/deactivate",
            f"/admin/v1/members/{fixed_id}/deactivate",
            {
                "reason": "Inventory authorization boundary check.",
                "expectedRecordVersion": 1,
                "confirmedMemberId": fixed_id,
            },
        ),
        (
            "GET",
            "/admin/v1/audit-events",
            "/admin/v1/audit-events",
            None,
        ),
        (
            "POST",
            "/admin/v1/exports",
            "/admin/v1/exports",
            {
                "format": "csv",
                "memberStatus": "active",
                "academicRole": None,
                "purposeCode": "periodic_roster_review",
                "confirmed": True,
            },
        ),
    ]
    expected_inventory = {
        (method, route_path)
        for method, route_path, _request_path, _body in route_cases
    }
    actual_inventory = {
        (method, route.path)
        for route in app.routes
        if route.path.startswith("/admin/v1/")
        for method in (route.methods or set())
        if method in {"GET", "POST"}
    }
    assert actual_inventory == expected_inventory

    settings = SETTINGS.model_copy(
        update={"phase10a_export_api_enabled": True}
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    _configure(engine)
    client = TestClient(app)

    for method, _route_path, request_path, body in route_cases:
        request_kwargs = {
            "headers": {"Idempotency-Key": "inventory-auth-0001"}
        }
        if body is not None:
            request_kwargs["json"] = body
        response = client.request(method, request_path, **request_kwargs)
        assert response.status_code == 401, (method, request_path, response.text)

    app.dependency_overrides[
        get_admin_google_token_verifier
    ] = WorkspaceVerifier
    for method, _route_path, request_path, body in route_cases:
        request_kwargs = {
            "headers": {
                "Authorization": "Bearer synthetic-workspace-token",
                "Idempotency-Key": "inventory-role-0001",
            }
        }
        if body is not None:
            request_kwargs["json"] = body
        response = client.request(method, request_path, **request_kwargs)
        assert response.status_code == 403, (method, request_path, response.text)
        assert response.json() == {"detail": "admin_access_denied"}

    app.dependency_overrides.clear()


def test_admin_mutation_kill_switch_preserves_read_routes(
    engine,
    monkeypatch,
) -> None:
    fixed_id = "22222222-2222-4222-8222-222222222222"
    settings = SETTINGS.model_copy(update={"admin_mutations_enabled": False})
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    factory = _configure(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="admin",
                active=True,
            )
        )
        session.commit()

    client = TestClient(app)
    session_response = client.get("/admin/v1/session", headers=_headers())
    assert session_response.status_code == 200
    assert session_response.json() == {
        "authorized": True,
        "role": "admin",
        "mutationsEnabled": False,
        "exportEnabled": False,
    }
    mutation_cases = [
        (
            f"/admin/v1/applications/{fixed_id}/decision",
            {
                "decision": "reject",
                "reason": "Mutation kill switch boundary check.",
                "expectedRecordVersion": 1,
            },
        ),
        (
            f"/admin/v1/operations/{fixed_id}/retry",
            {
                "reason": "Mutation kill switch boundary check.",
                "expectedRecordVersion": 1,
            },
        ),
        (
            f"/admin/v1/members/{fixed_id}/revoke",
            {
                "reason": "Mutation kill switch boundary check.",
                "expectedRecordVersion": 1,
                "confirmedMemberId": fixed_id,
            },
        ),
        (
            f"/admin/v1/members/{fixed_id}/deactivate",
            {
                "reason": "Mutation kill switch boundary check.",
                "expectedRecordVersion": 1,
                "confirmedMemberId": fixed_id,
            },
        ),
    ]
    for path, body in mutation_cases:
        response = client.post(
            path,
            headers=_headers("mutation-switch-0001"),
            json=body,
        )
        assert response.status_code == 404
        assert response.json() == {"detail": "Not found"}
    app.dependency_overrides.clear()


def test_bootstrap_is_create_only_and_cannot_promote_or_reactivate(engine) -> None:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        existing = LibraryAdmin(
            google_sub="inactive-viewer-sub",
            role="viewer",
            active=False,
            deactivated_at=datetime(2026, 8, 1, tzinfo=UTC),
        )
        session.add(existing)
        session.commit()

        with pytest.raises(
            AdminBootstrapConflict,
            match="administrator_already_exists",
        ):
            create_bootstrap_admin(
                session,
                subject="inactive-viewer-sub",
                role="admin",
            )

        session.expire_all()
        preserved = session.scalar(
            select(LibraryAdmin).where(
                LibraryAdmin.google_sub == "inactive-viewer-sub"
            )
        )
        assert preserved is not None
        assert preserved.role == "viewer"
        assert preserved.active is False
        assert preserved.deactivated_at is not None
