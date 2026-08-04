from collections.abc import Iterator
import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import LibraryAdmin, LibraryApplication, LibraryMember
from app.db.session import get_session
from app.main import app, get_admin_google_token_verifier


SETTINGS = Settings(
    phase6_auth_api_enabled=True,
    phase8_admin_api_enabled=True,
    google_oauth_client_ids="registration-client-id",
    google_admin_oauth_client_ids="admin-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    structured_logging_enabled=True,
)
ADMIN_IDENTITY = VerifiedGoogleIdentity(
    google_sub="security-event-admin-sub",
    email="security-event-admin@example.test",
    email_verified=True,
    hosted_domain=None,
    issuer="https://accounts.google.com",
    audience="admin-client-id",
)
UNAUTHORIZED_IDENTITY = VerifiedGoogleIdentity(
    google_sub="security-event-unauthorized-sub",
    email="unauthorized@example.test",
    email_verified=True,
    hosted_domain=None,
    issuer="https://accounts.google.com",
    audience="admin-client-id",
)
REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SEARCH_EMAIL = "private-search@example.test"
SEARCH_STUDENT_NUMBER = "PP23000"


class AdminVerifier:
    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-admin-token"
        return ADMIN_IDENTITY


class UnauthorizedVerifier:
    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-unauthorized-token"
        return UNAUTHORIZED_IDENTITY


def _configure(engine, verifier=AdminVerifier) -> sessionmaker[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_admin_google_token_verifier] = verifier
    return factory


def _headers(token: str = "synthetic-admin-token") -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Request-ID": REQUEST_ID,
    }


def test_successful_admin_reads_emit_only_pii_free_security_events(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    events: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.main.emit_event",
        lambda event, **fields: events.append({"event": event, **fields}),
    )
    factory = _configure(engine)
    with factory() as session:
        admin = LibraryAdmin(
            google_sub=ADMIN_IDENTITY.google_sub,
            role="viewer",
            active=True,
        )
        member = LibraryMember(
            normalized_email="roster-person@example.test",
            normalized_student_number=SEARCH_STUDENT_NUMBER,
            full_name="Private Roster Person",
            academic_role="undergraduate",
            faculty_code="pharmacy",
            grade="1",
            member_status="active",
        )
        application = LibraryApplication(
            member=member,
            idempotency_key="security-event-application",
            normalized_email="applicant@example.test",
            normalized_student_number="PP23001",
            full_name="Private Applicant",
            academic_role="staff",
            faculty_code="pharmacy",
            grade=None,
            question="Private application question",
            eligibility_status="manual_review",
            reason_codes=["role_requires_manual_review"],
            admin_decision="pending",
        )
        session.add_all([admin, member, application])
        session.commit()
        admin_id = admin.id
        application_id = application.id

    client = TestClient(app)
    responses = [
        client.get("/admin/v1/session", headers=_headers()),
        client.get("/admin/v1/applications", headers=_headers()),
        client.post(
            "/admin/v1/applications/search",
            headers=_headers(),
            json={"q": SEARCH_EMAIL, "offset": 0, "limit": 10},
        ),
        client.post(
            "/admin/v1/members/search",
            headers=_headers(),
            json={"q": SEARCH_STUDENT_NUMBER, "offset": 0, "limit": 10},
        ),
        client.get(
            f"/admin/v1/applications/{application_id}",
            headers=_headers(),
        ),
        client.get("/admin/v1/audit-events", headers=_headers()),
    ]
    app.dependency_overrides.clear()

    assert [response.status_code for response in responses] == [200] * 6
    assert [event["action"] for event in events] == [
        "admin.session.read",
        "admin.applications.list",
        "admin.applications.search",
        "admin.members.search",
        "admin.application.detail",
        "admin.audit.list",
    ]
    assert all(event["event"] == "admin_read_succeeded" for event in events)
    assert all(event["actor_admin_id"] == str(admin_id) for event in events)
    assert all(event["actor_role"] == "viewer" for event in events)
    assert all(event["request_id"] == REQUEST_ID for event in events)
    assert events[1]["result_count"] == 1
    assert events[2]["result_count"] == 0
    assert events[3]["result_count"] == 1
    assert events[4]["target_uuid"] == str(application_id)
    assert events[5]["result_count"] == 0
    assert all(
        set(event).issubset(
            {
                "event",
                "actor_admin_id",
                "actor_role",
                "action",
                "request_id",
                "result_count",
                "target_uuid",
            }
        )
        for event in events
    )

    serialized = json.dumps(events)
    for forbidden in (
        SEARCH_EMAIL,
        SEARCH_STUDENT_NUMBER,
        ADMIN_IDENTITY.google_sub,
        ADMIN_IDENTITY.email,
        "Private Roster Person",
        "roster-person@example.test",
        "Private Applicant",
        "applicant@example.test",
        "Private application question",
        "synthetic-admin-token",
    ):
        assert forbidden not in serialized


def test_denied_admin_read_does_not_emit_success_event(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    events: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.main.emit_event",
        lambda event, **fields: events.append({"event": event, **fields}),
    )
    factory = _configure(engine, UnauthorizedVerifier)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_IDENTITY.google_sub,
                role="admin",
                active=True,
            )
        )
        session.commit()

    response = TestClient(app).post(
        "/admin/v1/applications/search",
        headers=_headers("synthetic-unauthorized-token"),
        json={"q": SEARCH_EMAIL},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert events == []


def test_disabled_admin_read_does_not_emit_success_event(
    engine,
    monkeypatch,
) -> None:
    disabled_settings = SETTINGS.model_copy(
        update={"phase8_admin_api_enabled": False}
    )
    monkeypatch.setattr("app.main.get_settings", lambda: disabled_settings)
    events: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.main.emit_event",
        lambda event, **fields: events.append({"event": event, **fields}),
    )
    _configure(engine)

    response = TestClient(app).get("/admin/v1/session", headers=_headers())
    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert events == []
