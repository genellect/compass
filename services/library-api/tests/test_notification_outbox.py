from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryNotificationOutbox,
    LibraryOperation,
)
from app.drive_client import DrivePermission
from app.drive_operations import process_due_drive_operations
from app.notification_client import NotificationWebhookError
from app.notification_outbox import (
    enqueue_drive_success_notifications,
    process_due_notification_outbox,
)
from app.registration_service import persist_registration
from tests.factories import student_account, student_registration


SETTINGS = Settings(
    database_url="sqlite+pysqlite:///:memory:",
    external_side_effects_enabled=True,
    phase7_worker_api_enabled=True,
    phase7_drive_api_enabled=True,
    phase7_drive_kill_switch=False,
    phase7_notification_delivery_enabled=True,
    phase7_notification_kill_switch=False,
    phase7_worker_secret="phase7-test-worker-secret-32-characters",
    phase7_retry_base_seconds=1,
    notification_retry_base_seconds=1,
    drive_resource_id="phase7-synthetic-drive",
    drive_operation_attestation_key=(
        "notification-outbox-attestation-root-key-for-tests-v1"
    ),
    gas_notification_webhook_url="https://example.test/fsl-mail",
)
IDENTITY = VerifiedGoogleIdentity(
    google_sub="notification-synthetic-student-sub",
    email="student@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="notification-synthetic-client",
)


class FakeDriveClient:
    def __init__(self) -> None:
        self.permissions: dict[str, DrivePermission] = {}
        self.create_calls = 0

    def find_permission(
        self,
        _resource_id: str,
        email: str,
    ) -> DrivePermission | None:
        return self.permissions.get(email.lower())

    def create_reader_permission(
        self,
        _resource_id: str,
        email: str,
    ) -> DrivePermission:
        self.create_calls += 1
        permission = DrivePermission(
            permission_id=f"permission-{self.create_calls}",
            role="reader",
        )
        self.permissions[email.lower()] = permission
        return permission

    def delete_permission(
        self,
        _resource_id: str,
        _permission_id: str,
    ) -> None:
        raise AssertionError("revoke is outside notification tests")


class FakeWebhookClient:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, dict[str, Any]]] = []
        self.failures: list[NotificationWebhookError] = []

    def send(self, message_id: UUID, payload: dict[str, Any]) -> None:
        self.calls.append((message_id, payload.copy()))
        if self.failures:
            raise self.failures.pop(0)


class LostResponseThenDuplicateClient(FakeWebhookClient):
    def __init__(self) -> None:
        super().__init__()
        self.accepted: set[UUID] = set()

    def send(self, message_id: UUID, payload: dict[str, Any]) -> None:
        self.calls.append((message_id, payload.copy()))
        if message_id not in self.accepted:
            self.accepted.add(message_id)
            raise NotificationWebhookError(
                "notification_webhook_unavailable",
                retryable=True,
            )
        # GAS returns an idempotent success for this duplicate messageId.


def queued_registration(session: Session, *, key: str) -> LibraryOperation:
    persist_registration(
        session,
        student_account(),
        student_registration(),
        key,
        settings=SETTINGS,
        identity=IDENTITY,
    )
    operation = session.scalar(select(LibraryOperation))
    assert operation is not None
    return operation


def make_retry_due(
    session: Session,
    notification: LibraryNotificationOutbox,
) -> None:
    notification.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()


def test_drive_success_creates_one_idempotent_pii_minimal_outbox_row(
    session: Session,
) -> None:
    operation = queued_registration(session, key="notification-enqueue-0001")
    assert session.scalar(
        select(func.count()).select_from(LibraryNotificationOutbox)
    ) == 0

    drive = FakeDriveClient()
    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )
    enqueue_drive_success_notifications(session, operation)
    session.commit()

    rows = list(session.scalars(select(LibraryNotificationOutbox)))
    assert [result.status for result in processed] == ["succeeded"]
    assert len(rows) == 1
    assert rows[0].notification_type == "registration_drive_granted"
    assert rows[0].status == "pending"
    assert "student@" not in rows[0].notification_key
    assert "PP23000" not in rows[0].notification_key
    columns = {
        column["name"]
        for column in inspect(session.get_bind()).get_columns(
            "library_notification_outbox"
        )
    }
    assert not columns.intersection(
        {
            "body",
            "rendered_body",
            "recipient_email",
            "full_name",
            "student_number",
            "question",
        }
    )


def test_notification_payload_is_exact_eight_field_contract(
    session: Session,
) -> None:
    queued_registration(session, key="notification-payload-0001")
    process_due_drive_operations(session, FakeDriveClient(), SETTINGS, limit=1)
    webhook = FakeWebhookClient()

    result = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]

    message_id, payload = webhook.calls[0]
    assert result.status == "succeeded"
    assert result.notification_id == message_id
    assert set(payload) == {
        "registrationId",
        "fullName",
        "email",
        "grade",
        "question",
        "eligibilityStatus",
        "driveAccessStatus",
        "processedAt",
    }
    assert payload["grade"] == "3年"
    assert payload["question"] == ""
    assert payload["eligibilityStatus"] == "approved"
    assert payload["driveAccessStatus"] == "granted"
    serialized = str(payload)
    assert "PP23000" not in serialized
    assert "consent" not in serialized


def test_notification_payload_includes_application_question(
    session: Session,
) -> None:
    queued_registration(session, key="notification-question-0001")
    application = session.scalar(select(LibraryApplication))
    assert application is not None
    application.question = "図書館の利用方法を確認したいです。"
    session.commit()
    process_due_drive_operations(session, FakeDriveClient(), SETTINGS, limit=1)
    webhook = FakeWebhookClient()

    process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )

    assert webhook.calls[0][1]["question"] == "図書館の利用方法を確認したいです。"


def test_manual_review_queues_admin_only_notification(
    session: Session,
) -> None:
    persisted = persist_registration(
        session,
        student_account(),
        student_registration(faculty="other"),
        "notification-manual-review-0001",
        settings=SETTINGS,
        identity=IDENTITY,
    )
    notification = session.scalar(select(LibraryNotificationOutbox))
    assert persisted.eligibility.status.value == "manual_review"
    assert notification is not None
    assert notification.notification_type == "manual_review_requested"
    assert notification.access_grant_id is None
    assert notification.drive_operation_id is None

    webhook = FakeWebhookClient()
    result = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]

    assert result.status == "succeeded"
    payload = webhook.calls[0][1]
    assert set(payload) == {
        "registrationId",
        "fullName",
        "grade",
        "question",
        "eligibilityStatus",
        "processedAt",
    }
    assert payload["eligibilityStatus"] == "manual_review"
    assert "email" not in payload
    assert "driveAccessStatus" not in payload

def test_existing_permission_enqueues_already_granted_notification(
    session: Session,
) -> None:
    queued_registration(session, key="notification-existing-0001")
    drive = FakeDriveClient()
    drive.permissions["student@st.kitasato-u.ac.jp"] = DrivePermission(
        permission_id="existing-writer",
        role="writer",
    )
    process_due_drive_operations(session, drive, SETTINGS, limit=1)
    webhook = FakeWebhookClient()

    process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )

    grant = session.scalar(select(LibraryAccessGrant))
    assert grant is not None
    assert grant.status == "already_granted"
    assert webhook.calls[0][1]["driveAccessStatus"] == "already_granted"


def test_lost_webhook_response_replays_same_message_id_and_succeeds(
    session: Session,
) -> None:
    queued_registration(session, key="notification-replay-0001")
    process_due_drive_operations(session, FakeDriveClient(), SETTINGS, limit=1)
    webhook = LostResponseThenDuplicateClient()

    first = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]
    notification = session.get(LibraryNotificationOutbox, first.notification_id)
    assert notification is not None
    assert first.status == "failed"
    make_retry_due(session, notification)

    second = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]
    assert second.status == "succeeded"
    assert [call[0] for call in webhook.calls] == [
        first.notification_id,
        first.notification_id,
    ]
    assert webhook.calls[0][1] == webhook.calls[1][1]


def test_notification_failure_never_rolls_back_drive_grant(
    session: Session,
) -> None:
    operation = queued_registration(session, key="notification-failure-0001")
    process_due_drive_operations(session, FakeDriveClient(), SETTINGS, limit=1)
    webhook = FakeWebhookClient()
    webhook.failures = [
        NotificationWebhookError(
            "notification_webhook_rejected",
            retryable=False,
        )
    ]

    result = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]

    session.refresh(operation)
    grant = session.scalar(select(LibraryAccessGrant))
    assert grant is not None
    assert operation.status == "succeeded"
    assert grant.status == "granted"
    assert result.status == "dead"


def test_retry_is_finite_and_error_summary_contains_no_pii(
    session: Session,
) -> None:
    queued_registration(session, key="notification-finite-retry-0001")
    process_due_drive_operations(session, FakeDriveClient(), SETTINGS, limit=1)
    notification = session.scalar(select(LibraryNotificationOutbox))
    assert notification is not None
    notification.max_attempts = 2
    session.commit()
    webhook = FakeWebhookClient()
    webhook.failures = [
        NotificationWebhookError(
            "notification_webhook_unavailable",
            retryable=True,
        ),
        NotificationWebhookError(
            "notification_webhook_unavailable",
            retryable=True,
        ),
    ]

    first = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]
    session.refresh(notification)
    make_retry_due(session, notification)
    second = process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    )[0]
    session.refresh(notification)

    assert [first.status, second.status] == ["failed", "dead"]
    assert notification.attempt_count == 2
    assert "student@" not in (notification.error_summary or "")
    assert "PP23000" not in (notification.error_summary or "")
    assert process_due_notification_outbox(
        session,
        webhook,
        SETTINGS,
        limit=1,
    ) == []
