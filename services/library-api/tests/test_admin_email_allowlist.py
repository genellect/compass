from collections.abc import Iterator

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.auth import (
    GoogleAuthConfigurationError,
    GoogleCredentialError,
    GoogleTokenVerifier,
)
from app.config import Settings
from app.db.models import LibraryAdmin
from app.db.session import get_session
from app.main import app, get_admin_google_token_verifier


PERSONAL_ADMIN_EMAIL = "owner.personal@example.invalid"
WORKSPACE_ADMIN_EMAIL = "owner.workspace@example.invalid"
UNLISTED_WORKSPACE_EMAIL = "unlisted.workspace@example.invalid"
ADMIN_SUB = "synthetic-allowlisted-admin-sub"


def _settings(**updates: object) -> Settings:
    values: dict[str, object] = {
        "phase6_auth_api_enabled": True,
        "phase8_admin_api_enabled": True,
        "google_oauth_client_ids": "registration-client-id",
        "google_admin_oauth_client_ids": "admin-client-id",
        "google_admin_allowed_emails": PERSONAL_ADMIN_EMAIL,
        "allowed_google_hosted_domains": "st.kitasato-u.ac.jp",
    }
    values.update(updates)
    return Settings(**values)


def _claims(**updates: object) -> dict[str, object]:
    claims: dict[str, object] = {
        "aud": "admin-client-id",
        "iss": "https://accounts.google.com",
        "sub": ADMIN_SUB,
        "email": PERSONAL_ADMIN_EMAIL,
        "email_verified": True,
    }
    claims.update(updates)
    return claims


def _admin_verifier(
    settings: Settings,
    claims: dict[str, object],
) -> GoogleTokenVerifier:
    return GoogleTokenVerifier(
        settings,
        audience_kind="admin",
        claims_loader=lambda _credential, _audience: claims,
    )


def test_admin_allowlist_normalizes_case_and_accepts_workspace_identity() -> None:
    settings = _settings(
        google_admin_allowed_emails=(
            "  OWNER.PERSONAL@EXAMPLE.INVALID, "
            "OWNER.WORKSPACE@EXAMPLE.INVALID  "
        )
    )
    identity = _admin_verifier(
        settings,
        _claims(
            email="Owner.Workspace@EXAMPLE.INVALID",
            hd="st.kitasato-u.ac.jp",
        ),
    ).verify("synthetic-signed-admin-token")

    assert settings.google_admin_allowed_email_list == (
        PERSONAL_ADMIN_EMAIL,
        WORKSPACE_ADMIN_EMAIL,
    )
    assert identity.email == WORKSPACE_ADMIN_EMAIL
    assert identity.hosted_domain == "st.kitasato-u.ac.jp"


def test_allowlisted_personal_google_account_is_accepted_without_hd() -> None:
    identity = _admin_verifier(_settings(), _claims()).verify(
        "synthetic-signed-admin-token"
    )

    assert identity.email == PERSONAL_ADMIN_EMAIL
    assert identity.hosted_domain == ""
    assert identity.google_sub == ADMIN_SUB


def test_workspace_member_not_on_exact_allowlist_is_denied() -> None:
    verifier = _admin_verifier(
        _settings(),
        _claims(
            email=UNLISTED_WORKSPACE_EMAIL,
            hd="st.kitasato-u.ac.jp",
        ),
    )

    with pytest.raises(GoogleCredentialError) as captured:
        verifier.verify("synthetic-signed-admin-token")

    assert captured.value.code == "admin_email_not_allowed"
    assert captured.value.status_code == 403


@pytest.mark.parametrize("configured", ["", " , "])
def test_admin_verifier_fails_closed_when_allowlist_is_absent(
    configured: str,
) -> None:
    loader_called = False

    def loader(_credential: str, _audience: str | None):
        nonlocal loader_called
        loader_called = True
        return _claims()

    verifier = GoogleTokenVerifier(
        _settings(google_admin_allowed_emails=configured),
        audience_kind="admin",
        claims_loader=loader,
    )

    with pytest.raises(GoogleAuthConfigurationError, match="email allowlist"):
        verifier.verify("synthetic-signed-admin-token")

    assert loader_called is False


@pytest.mark.parametrize(
    "configured",
    [
        f"{PERSONAL_ADMIN_EMAIL},OWNER.PERSONAL@EXAMPLE.INVALID",
        "not-an-email",
    ],
)
def test_admin_verifier_rejects_ambiguous_or_invalid_allowlist(
    configured: str,
) -> None:
    verifier = _admin_verifier(
        _settings(google_admin_allowed_emails=configured),
        _claims(),
    )

    with pytest.raises(GoogleAuthConfigurationError):
        verifier.verify("synthetic-signed-admin-token")


@pytest.mark.parametrize(
    ("claim_updates", "expected_code", "expected_status"),
    [
        ({"aud": "registration-client-id"}, "invalid_google_credential", 401),
        ({"iss": "https://issuer.invalid"}, "invalid_google_credential", 401),
        ({"email_verified": False}, "unverified_google_email", 403),
        ({"sub": ""}, "invalid_google_credential", 401),
    ],
)
def test_admin_allowlist_does_not_replace_google_claim_validation(
    claim_updates: dict[str, object],
    expected_code: str,
    expected_status: int,
) -> None:
    verifier = _admin_verifier(_settings(), _claims(**claim_updates))

    with pytest.raises(GoogleCredentialError) as captured:
        verifier.verify("synthetic-signed-admin-token")

    assert captured.value.code == expected_code
    assert captured.value.status_code == expected_status


def test_admin_expired_or_invalid_signature_is_rejected_generically() -> None:
    def rejecting_loader(_credential: str, _audience: str | None):
        raise ValueError("synthetic expired or invalid signature")

    verifier = GoogleTokenVerifier(
        _settings(),
        audience_kind="admin",
        claims_loader=rejecting_loader,
    )

    with pytest.raises(GoogleCredentialError) as captured:
        verifier.verify("synthetic-signed-admin-token")

    assert captured.value.code == "invalid_google_credential"
    assert captured.value.status_code == 401


def test_registration_verifier_remains_workspace_bound() -> None:
    verifier = GoogleTokenVerifier(
        _settings(),
        claims_loader=lambda _credential, _audience: {
            **_claims(),
            "aud": "registration-client-id",
        },
    )

    with pytest.raises(GoogleCredentialError) as captured:
        verifier.verify("synthetic-signed-registration-token")

    assert captured.value.code == "workspace_membership_required"
    assert captured.value.status_code == 403


def _configure_session(engine) -> sessionmaker[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    return factory


def test_allowlisted_email_cannot_replace_database_subject_binding(
    engine,
    monkeypatch,
) -> None:
    settings = _settings()
    verifier = _admin_verifier(settings, _claims())
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    app.dependency_overrides[get_admin_google_token_verifier] = lambda: verifier
    factory = _configure_session(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub="different-database-sub",
                role="admin",
                active=True,
            )
        )
        session.commit()

    response = TestClient(app).get(
        "/admin/v1/session",
        headers={"Authorization": "Bearer synthetic-signed-admin-token"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {"detail": "admin_access_denied"}


def test_admin_http_surface_denies_email_outside_exact_allowlist(
    engine,
    monkeypatch,
) -> None:
    settings = _settings()
    verifier = _admin_verifier(
        settings,
        _claims(
            email=UNLISTED_WORKSPACE_EMAIL,
            hd="st.kitasato-u.ac.jp",
        ),
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    app.dependency_overrides[get_admin_google_token_verifier] = lambda: verifier
    _configure_session(engine)

    response = TestClient(app).get(
        "/admin/v1/session",
        headers={"Authorization": "Bearer synthetic-signed-admin-token"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {"detail": "admin_email_not_allowed"}


def test_allowlisted_email_and_active_database_subject_are_both_required(
    engine,
    monkeypatch,
) -> None:
    settings = _settings()
    verifier = _admin_verifier(settings, _claims())
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    app.dependency_overrides[get_admin_google_token_verifier] = lambda: verifier
    factory = _configure_session(engine)
    with factory() as session:
        session.add(
            LibraryAdmin(
                google_sub=ADMIN_SUB,
                role="admin",
                active=True,
            )
        )
        session.commit()

    response = TestClient(app).get(
        "/admin/v1/session",
        headers={"Authorization": "Bearer synthetic-signed-admin-token"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"authorized": True, "role": "admin"}
