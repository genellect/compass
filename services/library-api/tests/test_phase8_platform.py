import pytest
from fastapi.testclient import TestClient

from app.auth import GoogleCredentialError, GoogleTokenVerifier
from app.config import (
    PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION,
    PRODUCTION_ADMIN_MUTATIONS_ACTIVATION_CONFIRMATION,
    PRODUCTION_API_WRITES_ACTIVATION_CONFIRMATION,
    PRODUCTION_DRIVE_ACTIVATION_CONFIRMATION,
    PRODUCTION_EXPORT_ACTIVATION_CONFIRMATION,
    Settings,
)
from app.rate_limit import FixedWindowRateLimiter
from app.surface import create_surface_app


def _google_claims(audience: str) -> dict[str, object]:
    return {
        "aud": audience,
        "iss": "https://accounts.google.com",
        "sub": "phase8-audience-test-subject",
        "email": "owner.workspace@example.invalid",
        "email_verified": True,
        "hd": "example.test",
    }


def test_admin_google_verifier_accepts_only_dedicated_audience() -> None:
    settings = Settings(
        google_oauth_client_ids="registration-client-id",
        google_admin_oauth_client_ids="admin-client-id",
        google_admin_allowed_emails="owner.workspace@example.invalid",
        library_admin_edge_shared_secret="reserved-edge-secret-32-characters",
        allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    )
    admin_verifier = GoogleTokenVerifier(
        settings,
        audience_kind="admin",
        claims_loader=lambda _credential, _audience: _google_claims(
            "admin-client-id"
        ),
    )
    wrong_admin_verifier = GoogleTokenVerifier(
        settings,
        audience_kind="admin",
        claims_loader=lambda _credential, _audience: _google_claims(
            "registration-client-id"
        ),
    )

    identity = admin_verifier.verify("synthetic-admin-credential")
    assert identity.audience == "admin-client-id"
    with pytest.raises(GoogleCredentialError):
        wrong_admin_verifier.verify("synthetic-registration-credential")


def test_public_admin_and_worker_route_sets_are_isolated(monkeypatch) -> None:
    settings = Settings(
        phase6_auth_api_enabled=True,
        phase8_admin_api_enabled=True,
        google_admin_oauth_client_ids="admin-client-id",
        google_admin_allowed_emails="owner@example.invalid",
    )
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    public_paths = {route.path for route in create_surface_app("public").routes}
    admin_paths = {route.path for route in create_surface_app("admin").routes}
    worker_paths = {route.path for route in create_surface_app("worker").routes}

    assert "/phase6/registrations" in public_paths
    assert "/phase6/admin/authorization" not in public_paths
    assert "/admin/v1/session" not in public_paths
    assert "/phase7/internal/operations/process" not in public_paths

    assert "/phase6/admin/authorization" in admin_paths
    assert "/admin/v1/session" in admin_paths
    assert "/phase6/registrations" not in admin_paths
    assert "/phase7/internal/operations/process" not in admin_paths

    assert "/phase7/internal/operations/process" in worker_paths
    assert "/phase6/registrations" not in worker_paths
    assert "/admin/v1/session" not in worker_paths


def _production_public_settings(**updates: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "service_surface": "public",
        "database_url": (
            "postgresql+psycopg://api:secret@ep-test-pooler.example/"
            "neondb?sslmode=require"
        ),
        "database_url_unpooled": None,
        "runtime_database_role": "fsl_api_login",
        "public_database_access_mode": "rpc_v1",
        "public_registration_rpc_key_version": "v1",
        "public_registration_rpc_token": (
            "reserved-independent-public-rpc-token-32-characters"
        ),
        "phase5_local_api_enabled": False,
        "phase6_auth_api_enabled": True,
        "google_oauth_client_ids": "client-id",
        "allowed_google_hosted_domains": "st.kitasato-u.ac.jp",
        "cors_allowed_origins": "https://compass-official.pages.dev",
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


def _production_admin_settings(**updates: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "service_surface": "admin",
        "database_url": (
            "postgresql+psycopg://console:secret@ep-test-pooler.example/"
            "neondb?sslmode=require"
        ),
        "database_url_unpooled": None,
        "runtime_database_role": "fsl_console_login",
        "phase5_local_api_enabled": False,
        "phase6_auth_api_enabled": False,
        "phase8_admin_api_enabled": True,
        "phase8_admin_activation_confirmation": (
            PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION
        ),
        "google_admin_oauth_client_ids": "admin-client-id",
        "google_admin_allowed_emails": "owner.workspace@example.invalid",
        "library_admin_edge_shared_secret": "reserved-edge-secret-32-characters",
        "allowed_google_hosted_domains": "",
        "cors_allowed_origins": "",
        "rate_limits_enabled": True,
        "api_read_only_mode": True,
        "drive_operation_attestation_key": (
            "reserved-drive-attestation-key-32-characters"
        ),
    }
    values.update(updates)
    return Settings(**values)


def test_production_public_configuration_passes_only_fail_closed_boundary() -> None:
    settings = _production_public_settings()

    settings.validate_for_service()

    with pytest.raises(ValueError, match="must be empty"):
        settings.model_copy(
            update={
                "api_writes_activation_confirmation": (
                    PRODUCTION_API_WRITES_ACTIVATION_CONFIRMATION
                )
            }
        ).validate_for_service()
    with pytest.raises(ValueError, match="write activation confirmation"):
        settings.model_copy(
            update={"api_read_only_mode": False}
        ).validate_for_service()
    settings.model_copy(
        update={
            "api_read_only_mode": False,
            "api_writes_activation_confirmation": (
                PRODUCTION_API_WRITES_ACTIVATION_CONFIRMATION
            ),
        }
    ).validate_for_service()

    with pytest.raises(ValueError, match="must not receive administrator"):
        settings.model_copy(
            update={"google_admin_oauth_client_ids": "admin-client-id"}
        ).validate_for_service()

    with pytest.raises(ValueError, match="exact HTTPS"):
        settings.model_copy(
            update={"cors_allowed_origins": "http://localhost:3000"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="attestation key"):
        settings.model_copy(
            update={"drive_operation_attestation_key": "too-short"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="Drive resource ID"):
        settings.model_copy(
            update={"drive_resource_id": "must-remain-worker-only"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="must be rpc_v1"):
        settings.model_copy(
            update={"public_database_access_mode": "orm"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="RPC token"):
        settings.model_copy(
            update={"public_registration_rpc_token": "too-short"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="independent secret"):
        settings.model_copy(
            update={
                "public_registration_rpc_token": (
                    settings.drive_operation_attestation_key
                )
            }
        ).validate_for_service()


def test_production_admin_configuration_is_independent_and_fail_closed() -> None:
    settings = _production_admin_settings()
    settings.validate_for_service()

    with pytest.raises(ValueError, match="public authentication API"):
        settings.model_copy(
            update={"phase6_auth_api_enabled": True}
        ).validate_for_service()
    with pytest.raises(ValueError, match="email allowlist"):
        settings.model_copy(
            update={"google_admin_allowed_emails": ""}
        ).validate_for_service()
    with pytest.raises(ValueError, match="registration OAuth"):
        settings.model_copy(
            update={"google_oauth_client_ids": "registration-client-id"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="mutation activation confirmation"):
        settings.model_copy(
            update={
                "admin_mutations_enabled": True,
                "api_read_only_mode": False,
            }
        ).validate_for_service()
    settings.model_copy(
        update={
            "admin_mutations_enabled": True,
            "admin_mutations_activation_confirmation": (
                PRODUCTION_ADMIN_MUTATIONS_ACTIVATION_CONFIRMATION
            ),
            "api_read_only_mode": False,
        }
    ).validate_for_service()
    settings.model_copy(
        update={
            "phase10a_export_api_enabled": True,
            "phase10a_export_activation_confirmation": (
                PRODUCTION_EXPORT_ACTIVATION_CONFIRMATION
            ),
            "api_read_only_mode": False,
        }
    ).validate_for_service()
    with pytest.raises(ValueError, match="does not match entrypoint"):
        settings.validate_for_service("public")
    with pytest.raises(ValueError, match="Drive OAuth secrets"):
        settings.model_copy(
            update={"google_drive_oauth_refresh_token": "must-not-be-here"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="dedicated secret"):
        settings.model_copy(
            update={
                "drive_operation_attestation_key": (
                    settings.library_admin_edge_shared_secret
                )
            }
        ).validate_for_service()
    with pytest.raises(ValueError, match="pooled Neon"):
        settings.model_copy(
            update={
                "database_url": (
                    "postgresql+psycopg://api:secret@ep-test.example/"
                    "neondb?sslmode=require"
                )
            }
        ).validate_for_service()
    with pytest.raises(ValueError, match="runtime database role is required"):
        settings.model_copy(
            update={"runtime_database_role": ""}
        ).validate_for_service()
    with pytest.raises(ValueError, match="must not be an owner role"):
        settings.model_copy(
            update={"runtime_database_role": "neondb_owner"}
        ).validate_for_service()
    with pytest.raises(ValueError, match="require TLS"):
        settings.model_copy(
            update={
                "database_url": (
                    "postgresql+psycopg://api:secret@ep-test-pooler.example/neondb"
                )
            }
        ).validate_for_service()


def test_production_public_omits_admin_routes_while_standby(monkeypatch) -> None:
    settings = _production_public_settings()
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)

    public = create_surface_app("public")
    paths = {route.path for route in public.routes}

    assert "/phase6/registrations" in paths
    assert not any(path.startswith("/admin/v1/") for path in paths)
    assert TestClient(public).get("/admin/v1/session").status_code == 404

    with pytest.raises(ValueError, match="must not receive administrator"):
        settings.model_copy(
            update={"phase8_admin_api_enabled": True}
        ).validate_for_service()
    with pytest.raises(ValueError, match="Drive resource ID"):
        settings.model_copy(
            update={"drive_resource_id": "must-remain-worker-only"}
        ).validate_for_service()


def _production_worker_settings(**updates) -> Settings:
    values = {
        "app_env": "production",
        "service_surface": "worker",
        "database_url": (
            "postgresql+psycopg://worker:secret@ep-test-pooler.example/"
            "neondb?sslmode=require"
        ),
        "database_url_unpooled": None,
        "runtime_database_role": "fsl_worker_login",
        "phase5_local_api_enabled": False,
        "phase6_auth_api_enabled": False,
        "rate_limits_enabled": True,
        "worker_auth_mode": "cloud_run_oidc",
        "worker_oidc_audience": "https://library-worker.example.run.app",
        "worker_invoker_service_account": (
            "library-scheduler@example.iam.gserviceaccount.com"
        ),
        "drive_operation_attestation_key": (
            "reserved-drive-attestation-key-32-characters"
        ),
    }
    values.update(updates)
    return Settings(**values)


def test_production_worker_standby_is_healthy_and_safely_stopped(
    monkeypatch,
) -> None:
    settings = _production_worker_settings()

    settings.validate_for_service()
    with pytest.raises(ValueError, match="must be empty"):
        settings.model_copy(
            update={
                "phase7_drive_activation_confirmation": (
                    PRODUCTION_DRIVE_ACTIVATION_CONFIRMATION
                )
            }
        ).validate_for_service()
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    client = TestClient(create_surface_app("worker"))

    assert client.get("/health/live").json() == {"status": "ok"}
    stopped = client.post(
        "/phase7/internal/operations/process",
        json={"limit": 1},
    )
    assert stopped.status_code == 404
    assert stopped.json() == {"detail": "Not found"}


def test_production_worker_requires_explicit_activation_and_oidc() -> None:
    settings = _production_worker_settings(
        external_side_effects_enabled=True,
        phase7_worker_api_enabled=True,
        phase7_drive_api_enabled=True,
        phase7_drive_kill_switch=False,
        phase7_drive_activation_confirmation=(
            PRODUCTION_DRIVE_ACTIVATION_CONFIRMATION
        ),
        drive_resource_id="real-resource-id",
        google_drive_oauth_client_id="owner-client",
        google_drive_oauth_client_secret="owner-secret",
        google_drive_oauth_refresh_token="owner-refresh",
    )

    settings.validate_for_service()
    with pytest.raises(ValueError, match="activation confirmation"):
        settings.model_copy(
            update={"phase7_drive_activation_confirmation": ""}
        ).validate_for_service()
    with pytest.raises(ValueError, match="activation flags are inconsistent"):
        settings.model_copy(
            update={"phase7_drive_kill_switch": True}
        ).validate_for_service()
    with pytest.raises(ValueError, match="IAM/OIDC"):
        settings.model_copy(
            update={"worker_auth_mode": "shared_secret"}
        ).validate_for_service()


def test_production_migration_requires_direct_connection() -> None:
    settings = Settings(
        app_env="production",
        service_surface="migration",
        database_url=(
            "postgresql+psycopg://api:secret@ep-test-pooler.example/"
            "neondb?sslmode=require"
        ),
        database_url_unpooled=(
            "postgresql+psycopg://migrator:secret@ep-test.example/"
            "neondb?sslmode=require"
        ),
        public_registration_rpc_key_version="v1",
        public_registration_rpc_token=(
            "reserved-independent-public-rpc-token-32-characters"
        ),
        rate_limits_enabled=True,
    )
    settings.validate_for_service()

    with pytest.raises(ValueError, match="direct database URL"):
        settings.model_copy(update={"database_url_unpooled": None}).validate_for_service()


def test_public_surface_rejects_oversized_body_before_authentication() -> None:
    response = TestClient(create_surface_app("public")).post(
        "/phase6/registrations",
        content=b"x" * 20_000,
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "request_body_too_large"}


def test_public_surface_rejects_chunked_oversized_body() -> None:
    response = TestClient(create_surface_app("public")).post(
        "/phase6/registrations",
        content=iter((b"x" * 9_000, b"y" * 9_000)),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413


def test_structured_log_does_not_include_query_or_pii(capsys, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.surface.get_settings",
        lambda: Settings(structured_logging_enabled=True),
    )
    TestClient(create_surface_app("public")).get(
        "/not-found?email=person@st.kitasato-u.ac.jp&student=PP23000"
    )

    serialized = capsys.readouterr().out
    assert "person@st.kitasato-u.ac.jp" not in serialized
    assert "PP23000" not in serialized
    assert '"route":"unmatched"' in serialized


def test_cors_wraps_early_oversized_response(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.surface.get_settings",
        lambda: Settings(cors_allowed_origins="https://preview.example"),
    )
    response = TestClient(create_surface_app("public")).post(
        "/phase6/registrations",
        content=b"x" * 20_000,
        headers={
            "Content-Type": "application/json",
            "Origin": "https://preview.example",
        },
    )

    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == (
        "https://preview.example"
    )


def test_admin_surface_preserves_private_cache_policy_for_admin_exports(
    monkeypatch,
) -> None:
    settings = Settings(phase8_admin_api_enabled=True)
    monkeypatch.setattr("app.surface.get_settings", lambda: settings)
    response = TestClient(create_surface_app("admin")).post(
        "/admin/v1/exports",
        json={},
    )

    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_fixed_window_limiter_is_bounded_and_returns_retry_after() -> None:
    limiter = FixedWindowRateLimiter(max_entries=2)
    assert limiter.allow("subject-a", limit=1, window_seconds=60)[0] is True
    allowed, retry_after = limiter.allow("subject-a", limit=1, window_seconds=60)
    assert allowed is False
    assert 1 <= retry_after <= 60
    limiter.allow("subject-b", limit=1, window_seconds=60)
    limiter.allow("subject-c", limit=1, window_seconds=60)
    assert len(limiter._entries) == 2
