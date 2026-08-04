from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.auth import GoogleCredentialError, VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import LibraryAdmin
from app.db.session import get_session
from app.main import (
    app,
    get_admin_google_token_verifier,
    get_google_token_verifier,
)
from tests.factories import student_registration


SETTINGS = Settings(
    phase6_auth_api_enabled=True,
    google_oauth_client_ids="phase6-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    external_side_effects_enabled=False,
    drive_resource_id="phase6-synthetic-drive",
)
ADMIN_SETTINGS = SETTINGS.model_copy(
    update={
        # Administrator authentication is independently gated by Phase 8;
        # the registration OAuth surface may remain disabled.
        "phase6_auth_api_enabled": False,
        "phase8_admin_api_enabled": True,
        "google_admin_oauth_client_ids": "phase6-admin-client-id",
    }
)


IDENTITY = VerifiedGoogleIdentity(
    google_sub="synthetic-phase6-api-subject",
    email="student@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase6-client-id",
)


class FakeVerifier:
    def __init__(self, identity: VerifiedGoogleIdentity = IDENTITY) -> None:
        self.identity = identity

    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-google-id-token"
        return self.identity


class RejectingVerifier:
    def verify(self, _credential: str) -> VerifiedGoogleIdentity:
        raise GoogleCredentialError(
            "invalid_google_credential",
            status_code=401,
        )


def configure_dependencies(engine, verifier=FakeVerifier()) -> None:
    factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def override_session() -> Iterator[Session]:
        database_session = factory()
        try:
            yield database_session
        finally:
            database_session.close()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_google_token_verifier] = lambda: verifier
    app.dependency_overrides[get_admin_google_token_verifier] = lambda: verifier


def auth_headers(**extra: str) -> dict[str, str]:
    return {
        "Authorization": "Bearer synthetic-google-id-token",
        **extra,
    }


def test_phase6_auth_and_registration_use_server_verified_identity(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    configure_dependencies(engine)
    client = TestClient(app)

    authentication = client.post(
        "/phase6/auth/verify",
        headers=auth_headers(),
    )
    registration = client.post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase6-api-registration-0001",
        },
        json={
            "registration": student_registration().model_dump(
                by_alias=True
            )
        },
    )
    app.dependency_overrides.clear()

    assert authentication.status_code == 200
    assert authentication.json() == {
        "status": "verified",
        "email": "student@st.kitasato-u.ac.jp",
        "hostedDomain": "st.kitasato-u.ac.jp",
    }
    assert registration.status_code == 200
    assert registration.json()["status"] == "approved"
    assert registration.json()["identityLinked"] is True
    assert "memberId" not in registration.json()


def test_phase6_registration_rejects_client_supplied_account_facts(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    configure_dependencies(engine)
    client = TestClient(app)
    response = client.post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase6-extra-account-0001",
        },
        json={
            "registration": student_registration().model_dump(
                by_alias=True
            ),
            "account": {
                "verified": True,
                "hostedDomain": "st.kitasato-u.ac.jp",
            },
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 422


def test_phase6_routes_fail_closed_when_disabled(engine, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: Settings(phase6_auth_api_enabled=False),
    )
    configure_dependencies(engine)
    response = TestClient(app).post(
        "/phase6/auth/verify",
        headers=auth_headers(),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 404


def test_phase6_registration_read_only_mode_preserves_data(engine, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: SETTINGS.model_copy(update={"api_read_only_mode": True}),
    )
    configure_dependencies(engine)
    response = TestClient(app).post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase8-read-only-registration",
        },
        json={
            "registration": student_registration().model_dump(by_alias=True)
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "api_read_only"}


def test_phase6_invalid_credential_is_generic(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    configure_dependencies(engine, RejectingVerifier())
    response = TestClient(app).post(
        "/phase6/auth/verify",
        headers=auth_headers(),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json() == {"detail": "invalid_google_credential"}
    assert "synthetic-google-id-token" not in response.text


def test_phase6_admin_authorization_is_sub_based(engine, monkeypatch) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: ADMIN_SETTINGS)
    configure_dependencies(engine)
    factory = sessionmaker(bind=engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=IDENTITY.google_sub,
                role="admin",
                active=True,
            )
        )
        session.commit()

    response = TestClient(app).get(
        "/phase6/admin/authorization",
        headers=auth_headers(),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"authorized": True, "role": "admin"}


def test_phase6_general_workspace_member_is_not_an_admin(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: ADMIN_SETTINGS)
    configure_dependencies(engine)
    response = TestClient(app).get(
        "/phase6/admin/authorization",
        headers=auth_headers(),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {"detail": "admin_access_denied"}


def test_cors_preflight_allows_only_configured_local_origin() -> None:
    client = TestClient(app)
    allowed = client.options(
        "/phase6/auth/verify",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    rejected = client.options(
        "/phase6/auth/verify",
        headers={
            "Origin": "https://example.invalid",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == (
        "http://127.0.0.1:3000"
    )
    assert rejected.status_code == 400
