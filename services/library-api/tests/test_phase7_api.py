from __future__ import annotations

from collections.abc import Iterator
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import LibraryApplication
from app.db.session import get_session
from app.drive_client import DrivePermission
from app.main import (
    app,
    get_google_token_verifier,
    get_phase7_drive_client,
)
from tests.factories import student_registration


WORKER_SECRET = "phase7-e2e-worker-secret-at-least-32-characters"
SETTINGS = Settings(
    phase6_auth_api_enabled=True,
    google_oauth_client_ids="phase7-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    external_side_effects_enabled=True,
    phase7_worker_api_enabled=True,
    phase7_drive_api_enabled=True,
    phase7_drive_kill_switch=False,
    phase7_worker_secret=WORKER_SECRET,
    phase7_retry_base_seconds=1,
    drive_resource_id="phase7-e2e-drive",
    google_drive_oauth_client_id="synthetic-owner-client",
    google_drive_oauth_client_secret="synthetic-owner-secret",
    google_drive_oauth_refresh_token="synthetic-owner-refresh-token",
)
IDENTITY = VerifiedGoogleIdentity(
    google_sub="phase7-e2e-subject",
    email="student@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase7-client-id",
)


class FakeVerifier:
    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        assert credential == "synthetic-phase7-id-token"
        return IDENTITY


class FakeDriveClient:
    def __init__(self) -> None:
        self.permission: DrivePermission | None = None
        self.create_calls = 0
        self.delete_calls = 0

    def find_permission(
        self,
        _resource_id: str,
        _email: str,
    ) -> DrivePermission | None:
        return self.permission

    def create_reader_permission(
        self,
        _resource_id: str,
        _email: str,
    ) -> DrivePermission:
        self.create_calls += 1
        self.permission = DrivePermission("phase7-e2e-permission", "reader")
        return self.permission

    def delete_permission(
        self,
        _resource_id: str,
        _permission_id: str,
    ) -> None:
        self.delete_calls += 1
        self.permission = None


def configure_dependencies(engine, drive: FakeDriveClient) -> None:
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
    app.dependency_overrides[get_google_token_verifier] = FakeVerifier
    app.dependency_overrides[get_phase7_drive_client] = lambda: drive


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer synthetic-phase7-id-token"}


def worker_headers() -> dict[str, str]:
    return {"X-Phase7-Worker-Token": WORKER_SECRET}


def test_phase7_registration_grant_status_and_revoke_e2e(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    drive = FakeDriveClient()
    configure_dependencies(engine, drive)
    client = TestClient(app)

    registration = client.post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase7-api-e2e-registration-0001",
        },
        json={
            "registration": student_registration().model_dump(by_alias=True)
        },
    )
    assert registration.status_code == 200
    registration_payload = registration.json()
    assert registration_payload["status"] == "approved"
    assert registration_payload["driveAccessStatus"] == "pending"
    assert registration_payload["driveNotificationStatus"] == "pending"
    application_id = registration_payload["applicationId"]

    pending_status = client.get(
        f"/phase7/registrations/{application_id}/status",
        headers=auth_headers(),
    )
    assert pending_status.status_code == 200
    assert pending_status.json()["driveAccessStatus"] == "pending"

    unauthorized_worker = client.post(
        "/phase7/internal/operations/process",
        headers={"X-Phase7-Worker-Token": "wrong-worker-token"},
        json={"limit": 10},
    )
    assert unauthorized_worker.status_code == 403

    processed = client.post(
        "/phase7/internal/operations/process",
        headers=worker_headers(),
        json={"limit": 10},
    )
    assert processed.status_code == 200
    assert processed.json()["succeeded"] == 1
    assert drive.create_calls == 1

    granted_status = client.get(
        f"/phase7/registrations/{application_id}/status",
        headers=auth_headers(),
    )
    assert granted_status.status_code == 200
    assert granted_status.json()["driveAccessStatus"] == "granted"
    assert granted_status.json()["driveNotificationStatus"] == "sent_by_drive"

    with sessionmaker(bind=engine)() as session:
        application = session.get(LibraryApplication, UUID(application_id))
        assert application is not None
        assert application.member_id is not None
        member_id = application.member_id

    revoke = client.post(
        f"/phase7/internal/members/{member_id}/revoke",
        headers=worker_headers(),
    )
    assert revoke.status_code == 200
    assert revoke.json()["status"] == "pending"

    revoked = client.post(
        "/phase7/internal/operations/process",
        headers=worker_headers(),
        json={"limit": 10},
    )
    assert revoked.status_code == 200
    assert revoked.json()["succeeded"] == 1
    assert drive.delete_calls == 1

    revoked_status = client.get(
        f"/phase7/registrations/{application_id}/status",
        headers=auth_headers(),
    )
    app.dependency_overrides.clear()

    assert revoked_status.status_code == 200
    assert revoked_status.json()["driveAccessStatus"] == "revoked"


def test_registration_wakes_worker_without_exposing_registration_data(
    engine,
    monkeypatch,
) -> None:
    dispatched: list[bool] = []

    def fake_dispatch(_settings: Settings):
        from app.registration_event_dispatch import RegistrationEventDispatchResult

        dispatched.append(True)
        return RegistrationEventDispatchResult(enqueued=True, task_id="random-task")

    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    monkeypatch.setattr(
        "app.main.enqueue_registration_worker_wakeup",
        fake_dispatch,
    )
    drive = FakeDriveClient()
    configure_dependencies(engine, drive)
    response = TestClient(app).post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase7-event-dispatch-registration-0001",
        },
        json={
            "registration": student_registration().model_dump(by_alias=True)
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["driveAccessStatus"] == "pending"
    assert dispatched == [True]


def test_phase7_worker_kill_switch_leaves_operation_pending(
    engine,
    monkeypatch,
) -> None:
    stopped_settings = SETTINGS.model_copy(
        update={"phase7_drive_kill_switch": True}
    )
    monkeypatch.setattr("app.main.get_settings", lambda: stopped_settings)
    drive = FakeDriveClient()
    configure_dependencies(engine, drive)
    client = TestClient(app)

    registration = client.post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase7-kill-switch-registration-0001",
        },
        json={
            "registration": student_registration().model_dump(by_alias=True)
        },
    )
    response = client.post(
        "/phase7/internal/operations/process",
        headers=worker_headers(),
        json={"limit": 10},
    )
    app.dependency_overrides.clear()

    assert registration.status_code == 200
    assert registration.json()["driveAccessStatus"] == "pending"
    assert response.status_code == 503
    assert response.json() == {"detail": "phase7_drive_safely_stopped"}
    assert drive.create_calls == 0


def test_phase7_dead_operation_can_be_retried_through_internal_api(
    engine,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.main.get_settings", lambda: SETTINGS)
    drive = FakeDriveClient()

    class FailingOnceDrive(FakeDriveClient):
        def __init__(self) -> None:
            super().__init__()
            self.fail_once = True

        def find_permission(self, resource_id: str, email: str):
            if self.fail_once:
                self.fail_once = False
                from app.drive_client import DriveClientError

                raise DriveClientError(
                    "drive_permission_denied",
                    retryable=False,
                )
            return super().find_permission(resource_id, email)

    drive = FailingOnceDrive()
    configure_dependencies(engine, drive)
    client = TestClient(app)
    registration = client.post(
        "/phase6/registrations",
        headers={
            **auth_headers(),
            "Idempotency-Key": "phase7-manual-retry-e2e-0001",
        },
        json={
            "registration": student_registration().model_dump(by_alias=True)
        },
    )
    assert registration.status_code == 200
    failed = client.post(
        "/phase7/internal/operations/process",
        headers=worker_headers(),
        json={"limit": 1},
    )
    operation_id = failed.json()["results"][0]["operationId"]
    assert failed.json()["dead"] == 1

    retry = client.post(
        f"/phase7/internal/operations/{operation_id}/retry",
        headers=worker_headers(),
    )
    recovered = client.post(
        "/phase7/internal/operations/process",
        headers=worker_headers(),
        json={"limit": 1},
    )
    app.dependency_overrides.clear()

    assert retry.status_code == 200
    assert retry.json()["status"] == "pending"
    assert recovered.json()["succeeded"] == 1
