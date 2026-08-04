from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import GoogleTokenVerifier
from app.config import PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION, Settings
from app.surface import EXPECTED_ALEMBIC_HEAD, create_surface_app


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
RESERVED_EDGE_SECRET = "reserved-edge-secret-32-characters"


class RecordingLimiter:
    def __init__(self, *, allowed: bool) -> None:
        self.allowed = allowed
        self.calls: list[str] = []

    def allow(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        del limit, window_seconds
        self.calls.append(key)
        return self.allowed, 19


class RecordingReadySession:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def execute(self, statement):
        self.statements.append(str(statement))

    def scalar(self, statement):
        self.statements.append(str(statement))
        return EXPECTED_ALEMBIC_HEAD


def _production_settings(**updates: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "service_surface": "admin",
        "database_url": (
            "postgresql+psycopg://console:secret@ep-test-pooler.example/"
            "neondb?sslmode=require"
        ),
        "database_url_unpooled": None,
        "runtime_database_role": "fsl_console_login",
        "phase6_auth_api_enabled": False,
        "phase8_admin_api_enabled": True,
        "phase8_admin_activation_confirmation": (
            PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION
        ),
        "google_admin_oauth_client_ids": "admin-client-id",
        "google_admin_allowed_emails": "owner@example.invalid",
        "library_admin_edge_shared_secret": RESERVED_EDGE_SECRET,
        "allowed_google_hosted_domains": "",
        "cors_allowed_origins": "",
        "rate_limits_enabled": True,
        "api_read_only_mode": True,
        "terms_version": "terms-1.0",
        "privacy_version": "privacy-1.0",
        "terms_content_sha256": "a" * 64,
        "privacy_content_sha256": "b" * 64,
        "drive_operation_attestation_key": (
            "reserved-drive-attestation-key-32-characters"
        ),
    }
    values.update(updates)
    return Settings(**values)


@pytest.mark.parametrize(
    ("path", "headers"),
    (
        (
            "/phase6/admin/authorization",
            {"Authorization": "Bearer synthetic-admin-token"},
        ),
        (
            "/admin/v1/session",
            {
                "Authorization": "Bearer synthetic-admin-token",
                "X-Library-Admin-Edge-Secret": "incorrect-edge-secret",
            },
        ),
    ),
)
def test_production_admin_origin_rejection_precedes_limiter_and_google_auth(
    path: str,
    headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings()
    limiter = RecordingLimiter(allowed=True)
    verification_calls: list[str] = []

    def unexpected_verification(
        _verifier: GoogleTokenVerifier,
        credential: str,
    ) -> None:
        verification_calls.append(credential)
        raise AssertionError("Google verification must follow the edge boundary")

    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)
    monkeypatch.setattr(GoogleTokenVerifier, "verify", unexpected_verification)

    response = TestClient(create_surface_app("admin")).get(
        path,
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
    assert response.headers["cache-control"] == "no-store"
    assert limiter.calls == []
    assert verification_calls == []
    assert "edge" not in response.text.lower()
    assert "secret" not in response.text.lower()


def test_valid_edge_origin_reaches_admin_limiter_before_google_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings()
    limiter = RecordingLimiter(allowed=False)
    verification_calls: list[str] = []

    def unexpected_verification(
        _verifier: GoogleTokenVerifier,
        credential: str,
    ) -> None:
        verification_calls.append(credential)
        raise AssertionError("Google verification must follow the admin limiter")

    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)
    monkeypatch.setattr(GoogleTokenVerifier, "verify", unexpected_verification)

    response = TestClient(create_surface_app("admin")).get(
        "/admin/v1/session",
        headers={
            "Authorization": "Bearer synthetic-admin-token",
            "X-Library-Admin-Edge-Secret": RESERVED_EDGE_SECRET,
        },
    )

    assert response.status_code == 429
    assert response.json() == {"detail": "rate_limit_exceeded"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["retry-after"] == "19"
    assert limiter.calls == ["admin-preauth-global"]
    assert verification_calls == []


def test_production_admin_live_is_the_only_public_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings()
    limiter = RecordingLimiter(allowed=False)

    def unexpected_database_factory():
        raise AssertionError("Liveness must not open the database")

    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)
    monkeypatch.setattr(
        "app.surface.get_session_factory",
        unexpected_database_factory,
    )

    response = TestClient(create_surface_app("admin")).get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert limiter.calls == []


@pytest.mark.parametrize(
    ("path", "edge_secret"),
    (
        ("/health/ready", None),
        ("/health/ready", "wrong-edge-secret"),
        ("/unknown-admin-probe", None),
        ("/unknown-admin-probe", "wrong-edge-secret"),
    ),
)
def test_production_admin_ready_and_unknown_paths_fail_before_database(
    path: str,
    edge_secret: str | None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings()
    limiter = RecordingLimiter(allowed=True)

    def unexpected_database_factory():
        raise AssertionError("Rejected edge requests must not open the database")

    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)
    monkeypatch.setattr(
        "app.surface.get_session_factory",
        unexpected_database_factory,
    )
    headers = (
        {"X-Library-Admin-Edge-Secret": edge_secret}
        if edge_secret is not None
        else {}
    )

    response = TestClient(create_surface_app("admin")).get(
        path,
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}
    assert limiter.calls == []


def test_valid_edge_ready_is_limited_then_checks_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings()
    limiter = RecordingLimiter(allowed=True)
    session = RecordingReadySession()
    boundary_calls: list[tuple[str, str]] = []

    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)
    monkeypatch.setattr(
        "app.surface.get_session_factory",
        lambda: lambda: session,
    )
    monkeypatch.setattr(
        "app.surface.verify_runtime_database_boundary",
        lambda _session, *, surface, expected_role, **_kwargs: (
            boundary_calls.append((surface, expected_role))
        ),
    )

    response = TestClient(create_surface_app("admin")).get(
        "/health/ready",
        headers={
            "X-Library-Admin-Edge-Secret": RESERVED_EDGE_SECRET,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert limiter.calls == ["admin-preauth-global"]
    assert session.statements == [
        "SELECT 1",
        "SELECT version_num FROM alembic_version",
    ]
    assert boundary_calls == [("admin", "fsl_console_login")]


def test_local_admin_preview_does_not_require_edge_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        phase6_auth_api_enabled=True,
        phase8_admin_api_enabled=True,
        google_oauth_client_ids="registration-client-id",
        google_admin_oauth_client_ids="admin-client-id",
        google_admin_allowed_emails="owner@example.invalid",
        allowed_google_hosted_domains="st.kitasato-u.ac.jp",
        rate_limits_enabled=True,
    )
    limiter = RecordingLimiter(allowed=False)
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)

    response = TestClient(create_surface_app("admin")).get(
        "/admin/v1/session",
        headers={"Authorization": "Bearer synthetic-admin-token"},
    )

    assert response.status_code == 429
    assert limiter.calls == ["admin-preauth-global"]


@pytest.mark.parametrize(
    "invalid_secret",
    ("", "too-short", " " * 32, "x" * 513),
)
def test_production_admin_startup_rejects_invalid_edge_secret(
    invalid_secret: str,
) -> None:
    settings = _production_settings().model_copy(
        update={"library_admin_edge_shared_secret": invalid_secret}
    )

    with pytest.raises(ValueError, match="edge boundary"):
        settings.validate_for_service("admin")


def test_edge_secret_is_plumbed_only_as_private_runtime_configuration() -> None:
    service_example = (
        REPOSITORY_ROOT / "services" / "library-api" / ".env.example"
    ).read_text(encoding="utf-8")
    compose = (REPOSITORY_ROOT / "compose.library-dev.yaml").read_text(
        encoding="utf-8"
    )
    terraform_root = (
        REPOSITORY_ROOT / "infra" / "library-registration" / "terraform"
    )
    main = (terraform_root / "main.tf").read_text(encoding="utf-8")
    variables = (terraform_root / "variables.tf").read_text(encoding="utf-8")
    example = (terraform_root / "terraform.tfvars.example").read_text(
        encoding="utf-8"
    )

    assert "LIBRARY_ADMIN_EDGE_SHARED_SECRET=" in service_example
    assert "LIBRARY_ADMIN_EDGE_SHARED_SECRET:" in compose
    assert "LIBRARY_ADMIN_EDGE_SHARED_SECRET = {" in main
    assert "var.secret_ids.admin_edge_shared_secret" in main
    assert "var.secret_versions.admin_edge_shared_secret" in main
    assert "admin_edge_shared_secret" in variables
    assert 'admin_edge_shared_secret    = "fsl-admin-edge-shared-secret"' in example
    assert "admin_runtime_db" in main
    assert "google_service_account.admin[0].member" in main
    assert RESERVED_EDGE_SECRET not in service_example
    assert RESERVED_EDGE_SECRET not in compose
    assert RESERVED_EDGE_SECRET not in main
    assert RESERVED_EDGE_SECRET not in variables
    assert RESERVED_EDGE_SECRET not in example
