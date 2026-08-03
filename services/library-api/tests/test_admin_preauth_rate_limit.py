from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import GoogleTokenVerifier
from app.config import PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION, Settings
from app.surface import create_surface_app


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class StubLimiter:
    def __init__(self, *, allowed: bool, retry_after: int = 17) -> None:
        self.allowed = allowed
        self.retry_after = retry_after
        self.calls: list[tuple[str, int, int]] = []

    def allow(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        self.calls.append((key, limit, window_seconds))
        return self.allowed, self.retry_after


def _enabled_settings(**updates: object) -> Settings:
    values: dict[str, object] = {
        "phase6_auth_api_enabled": True,
        "phase8_admin_api_enabled": True,
        "google_oauth_client_ids": "registration-client-id",
        "google_admin_oauth_client_ids": "admin-client-id",
        "google_admin_allowed_emails": "owner@example.invalid",
        "allowed_google_hosted_domains": "st.kitasato-u.ac.jp",
        "rate_limits_enabled": True,
        "admin_preauth_rate_limit_per_minute": 30,
    }
    values.update(updates)
    return Settings(**values)


@pytest.mark.parametrize(
    "path",
    (
        "/phase6/admin/authorization",
        "/admin/v1/session",
        "/admin/v1/audit-events",
    ),
)
def test_admin_surface_throttles_before_google_verification(
    path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _enabled_settings()
    limiter = StubLimiter(allowed=False)
    verification_calls: list[str] = []

    def unexpected_verification(
        _verifier: GoogleTokenVerifier,
        credential: str,
    ) -> None:
        verification_calls.append(credential)
        raise AssertionError("Google token verification must not run after throttling")

    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)
    monkeypatch.setattr(GoogleTokenVerifier, "verify", unexpected_verification)

    response = TestClient(create_surface_app("admin")).get(
        path,
        headers={"Authorization": "Bearer synthetic-admin-token"},
    )

    assert response.status_code == 429
    assert response.json() == {"detail": "rate_limit_exceeded"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["retry-after"] == "17"
    assert verification_calls == []
    assert limiter.calls == [("admin-preauth-global", 30, 60)]


def test_admin_limiter_does_not_change_registration_authentication(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _enabled_settings()
    limiter = StubLimiter(allowed=False)
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)

    response = TestClient(create_surface_app("public")).post(
        "/phase6/registrations",
        json={},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "google_authentication_required"}
    assert limiter.calls == []


def test_admin_limiter_does_not_consume_options_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _enabled_settings(
        cors_allowed_origins="https://preview.example",
    )
    limiter = StubLimiter(allowed=False)
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.surface.admin_preauth_rate_limiter", limiter)

    response = TestClient(create_surface_app("admin")).options(
        "/admin/v1/session",
        headers={
            "Origin": "https://preview.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 405
    assert limiter.calls == []


def _production_settings() -> Settings:
    return Settings(
        app_env="production",
        service_surface="admin",
        database_url=(
            "postgresql+psycopg://api:secret@ep-test-pooler.example/"
            "neondb?sslmode=require"
        ),
        database_url_unpooled=None,
        runtime_database_role="fsl_console_login",
        phase6_auth_api_enabled=False,
        phase8_admin_api_enabled=True,
        phase8_admin_activation_confirmation=(
            PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION
        ),
        google_admin_oauth_client_ids="admin-client-id",
        google_admin_allowed_emails="owner@example.invalid",
        library_admin_edge_shared_secret="reserved-edge-secret-32-characters",
        allowed_google_hosted_domains="",
        cors_allowed_origins="",
        rate_limits_enabled=True,
        api_read_only_mode=True,
        terms_version="terms-1.0",
        privacy_version="privacy-1.0",
        terms_content_sha256="a" * 64,
        privacy_content_sha256="b" * 64,
        drive_operation_attestation_key=(
            "reserved-drive-attestation-key-32-characters"
        ),
    )


@pytest.mark.parametrize("invalid_limit", (0, 121))
def test_production_admin_surface_rejects_bypassed_limit_bounds(
    invalid_limit: int,
) -> None:
    settings = _production_settings()
    settings.validate_for_service("admin")

    with pytest.raises(ValueError, match="admin pre-auth rate limit"):
        settings.model_copy(
            update={"admin_preauth_rate_limit_per_minute": invalid_limit}
        ).validate_for_service("admin")


def test_admin_preauth_limit_is_plumbed_to_local_and_production_assets() -> None:
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

    assert "ADMIN_PREAUTH_RATE_LIMIT_PER_MINUTE=30" in service_example
    assert 'ADMIN_PREAUTH_RATE_LIMIT_PER_MINUTE: "30"' in compose
    assert "ADMIN_PREAUTH_RATE_LIMIT_PER_MINUTE" in main
    assert "tostring(var.admin_preauth_rate_limit_per_minute)" in main
    assert 'variable "admin_preauth_rate_limit_per_minute"' in variables
    assert "admin_preauth_rate_limit_per_minute = 30" in example
