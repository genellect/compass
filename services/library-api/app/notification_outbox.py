from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryMember,
    LibraryNotificationOutbox,
    LibraryOperation,
)
from app.notification_client import (
    NotificationWebhookClient,
    NotificationWebhookError,
)
from app.observability import emit_event
from app.roster import roster_grade_label


DRIVE_NOTIFICATION_TYPE = "registration_drive_granted"
MANUAL_REVIEW_NOTIFICATION_TYPE = "manual_review_requested"
NOTIFICATION_TYPES = (
    DRIVE_NOTIFICATION_TYPE,
    MANUAL_REVIEW_NOTIFICATION_TYPE,
)
SAFE_ERROR_SUMMARIES = {
    "notification_webhook_unavailable": (
        "The notification webhook is temporarily unavailable."
    ),
    "notification_webhook_retryable_error": (
        "The notification webhook requested a retry."
    ),
    "notification_request_failed": (
        "The notification request could not be sent."
    ),
    "notification_webhook_rejected": (
        "The notification webhook rejected the request."
    ),
    "notification_invalid_response": (
        "The notification webhook returned an invalid response."
    ),
    "notification_state_invalid": (
        "The notification source state is invalid."
    ),
    "notification_internal_error": (
        "The notification operation failed safely."
    ),
}


@dataclass(frozen=True)
class NotificationOperationResult:
    notification_id: UUID
    status: str
    error_code: str | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _iso_utc(value: datetime) -> str:
    normalized = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return normalized.astimezone(UTC).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


def enqueue_drive_success_notifications(
    session: Session,
    operation: LibraryOperation,
) -> list[LibraryNotificationOutbox]:
    """Create one opaque outbox row only after an eligible Drive success."""
    if (
        operation.operation_type != "drive_grant"
        or operation.status != "succeeded"
        or operation.application_id is None
        or operation.completed_at is None
    ):
        return []
    application = session.get(LibraryApplication, operation.application_id)
    member = session.get(LibraryMember, operation.member_id)
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == operation.member_id,
            LibraryAccessGrant.target_alias == operation.target_alias,
        )
    )
    eligible = application is not None and (
        application.eligibility_status == "approved"
        or application.admin_decision == "approved"
    )
    if (
        not eligible
        or application is None
        or application.member_id != operation.member_id
        or member is None
        or member.member_status != "active"
        or grant is None
        or grant.status not in {"granted", "already_granted"}
    ):
        return []

    queued: list[LibraryNotificationOutbox] = []
    for notification_type in (DRIVE_NOTIFICATION_TYPE,):
        notification_key = (
            f"drive_grant:{operation.id}:{notification_type}:v1"
        )
        existing = session.scalar(
            select(LibraryNotificationOutbox).where(
                LibraryNotificationOutbox.notification_key == notification_key
            )
        )
        if existing is not None:
            queued.append(existing)
            continue
        candidate = LibraryNotificationOutbox(
            id=uuid4(),
            member_id=member.id,
            application_id=application.id,
            access_grant_id=grant.id,
            drive_operation_id=operation.id,
            notification_key=notification_key,
            notification_type=notification_type,
            status="pending",
            attempt_count=0,
            max_attempts=5,
        )
        try:
            # A savepoint makes concurrent/replayed completion idempotent
            # without rolling back the already-successful Drive transaction.
            with session.begin_nested():
                session.add(candidate)
                session.flush()
        except IntegrityError:
            existing = session.scalar(
                select(LibraryNotificationOutbox).where(
                    LibraryNotificationOutbox.notification_key
                    == notification_key
                )
            )
            if existing is not None:
                queued.append(existing)
        else:
            queued.append(candidate)
    return queued


def enqueue_manual_review_notification(
    session: Session,
    application: LibraryApplication,
) -> LibraryNotificationOutbox | None:
    """Queue one admin-only notification for a pending manual review."""
    if (
        application.eligibility_status != "manual_review"
        or application.admin_decision != "pending"
    ):
        return None
    notification_key = f"manual_review:{application.id}:v1"
    existing = session.scalar(
        select(LibraryNotificationOutbox).where(
            LibraryNotificationOutbox.notification_key == notification_key
        )
    )
    if existing is not None:
        return existing
    candidate = LibraryNotificationOutbox(
        id=uuid4(),
        member_id=application.member_id,
        application_id=application.id,
        access_grant_id=None,
        drive_operation_id=None,
        notification_key=notification_key,
        notification_type=MANUAL_REVIEW_NOTIFICATION_TYPE,
        status="pending",
        attempt_count=0,
        max_attempts=5,
    )
    try:
        with session.begin_nested():
            session.add(candidate)
            session.flush()
    except IntegrityError:
        return session.scalar(
            select(LibraryNotificationOutbox).where(
                LibraryNotificationOutbox.notification_key
                == notification_key
            )
        )
    return candidate


def _claim_next_notification(
    session: Session,
    settings: Settings,
    worker_id: str,
) -> UUID | None:
    now = _now()
    due = or_(
        LibraryNotificationOutbox.status == "pending",
        and_(
            LibraryNotificationOutbox.status == "failed",
            or_(
                LibraryNotificationOutbox.next_attempt_at.is_(None),
                LibraryNotificationOutbox.next_attempt_at <= now,
            ),
        ),
        and_(
            LibraryNotificationOutbox.status == "running",
            LibraryNotificationOutbox.locked_until <= now,
        ),
    )
    notification_id = session.scalar(
        select(LibraryNotificationOutbox.id)
        .where(due)
        .order_by(
            LibraryNotificationOutbox.created_at,
            LibraryNotificationOutbox.notification_type.desc(),
            LibraryNotificationOutbox.id,
        )
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if notification_id is None:
        session.rollback()
        return None
    notification = session.get(LibraryNotificationOutbox, notification_id)
    if notification is None:
        session.rollback()
        return None
    notification.status = "running"
    notification.lease_owner = worker_id
    notification.locked_until = now + timedelta(
        seconds=settings.notification_operation_lease_seconds
    )
    notification.error_code = None
    notification.error_summary = None
    notification.next_attempt_at = None
    session.commit()
    return notification_id


def _build_payload(
    session: Session,
    notification: LibraryNotificationOutbox,
) -> dict[str, Any]:
    application = session.get(
        LibraryApplication,
        notification.application_id,
    )
    if notification.notification_type == MANUAL_REVIEW_NOTIFICATION_TYPE:
        member = (
            session.get(LibraryMember, notification.member_id)
            if notification.member_id is not None
            else None
        )
        valid_member_link = (
            application is not None
            and application.member_id == notification.member_id
            and (
                notification.member_id is None
                or (
                    member is not None
                    and member.member_status in {"active", "pending_review"}
                )
            )
        )
        valid = (
            application is not None
            and application.eligibility_status == "manual_review"
            and application.admin_decision == "pending"
            and notification.access_grant_id is None
            and notification.drive_operation_id is None
            and valid_member_link
        )
        if not valid or application is None:
            raise NotificationWebhookError(
                "notification_state_invalid",
                retryable=False,
            )
        full_name = application.full_name.strip()
        if not full_name:
            raise NotificationWebhookError(
                "notification_state_invalid",
                retryable=False,
            )
        return {
            "registrationId": str(application.id),
            "fullName": full_name,
            "grade": roster_grade_label(
                application.academic_role,
                application.grade,
            ),
            "question": application.question or "",
            "eligibilityStatus": "manual_review",
            "processedAt": _iso_utc(application.created_at),
        }

    member = (
        session.get(LibraryMember, notification.member_id)
        if notification.member_id is not None
        else None
    )
    grant = session.get(LibraryAccessGrant, notification.access_grant_id)
    operation = session.get(
        LibraryOperation,
        notification.drive_operation_id,
    )
    eligible = application is not None and (
        application.eligibility_status == "approved"
        or application.admin_decision == "approved"
    )
    valid = (
        member is not None
        and member.member_status == "active"
        and application is not None
        and application.member_id == notification.member_id
        and eligible
        and grant is not None
        and grant.member_id == notification.member_id
        and grant.status in {"granted", "already_granted"}
        and operation is not None
        and operation.id == notification.drive_operation_id
        and operation.member_id == notification.member_id
        and operation.application_id == notification.application_id
        and operation.operation_type == "drive_grant"
        and operation.status == "succeeded"
        and operation.completed_at is not None
        and notification.notification_type == DRIVE_NOTIFICATION_TYPE
    )
    if not valid:
        raise NotificationWebhookError(
            "notification_state_invalid",
            retryable=False,
        )
    assert member is not None
    assert application is not None
    assert grant is not None
    assert operation is not None
    assert operation.completed_at is not None

    if not member.full_name.strip() or not (
        member.normalized_email or ""
    ).strip():
        raise NotificationWebhookError(
            "notification_state_invalid",
            retryable=False,
        )
    return {
        "registrationId": str(application.id),
        "fullName": member.full_name,
        "email": member.normalized_email,
        "grade": roster_grade_label(
            application.academic_role,
            application.grade,
        ),
        "question": application.question or "",
        "eligibilityStatus": "approved",
        "driveAccessStatus": grant.status,
        "processedAt": _iso_utc(operation.completed_at),
    }


def _finish_success(
    session: Session,
    notification: LibraryNotificationOutbox,
) -> NotificationOperationResult:
    notification.status = "succeeded"
    notification.error_code = None
    notification.error_summary = None
    notification.next_attempt_at = None
    notification.lease_owner = None
    notification.locked_until = None
    notification.completed_at = _now()
    session.commit()
    return NotificationOperationResult(notification.id, "succeeded")


def _finish_error(
    session: Session,
    notification: LibraryNotificationOutbox,
    error: NotificationWebhookError,
    settings: Settings,
) -> NotificationOperationResult:
    retryable = (
        error.retryable
        and notification.attempt_count < notification.max_attempts
    )
    notification.status = "failed" if retryable else "dead"
    notification.error_code = error.code
    notification.error_summary = SAFE_ERROR_SUMMARIES.get(
        error.code,
        "Notification delivery failed safely.",
    )
    notification.lease_owner = None
    notification.locked_until = None
    notification.completed_at = None if retryable else _now()
    if retryable:
        delay = min(
            settings.notification_retry_base_seconds
            * (2 ** max(notification.attempt_count - 1, 0)),
            3600,
        )
        notification.next_attempt_at = _now() + timedelta(seconds=delay)
    else:
        notification.next_attempt_at = None
    notification_id = notification.id
    notification_type = notification.notification_type
    status = notification.status
    session.commit()
    if status == "dead":
        emit_event(
            "notification_operation_dead",
            notification_type=notification_type,
            error_code=error.code,
        )
    return NotificationOperationResult(
        notification_id,
        status,
        error.code,
    )


def _process_notification(
    session: Session,
    notification_id: UUID,
    client: NotificationWebhookClient,
    settings: Settings,
) -> NotificationOperationResult:
    notification = session.get(LibraryNotificationOutbox, notification_id)
    if notification is None:
        raise RuntimeError("notification_not_found")
    notification.attempt_count += 1
    try:
        payload = _build_payload(session, notification)
    except NotificationWebhookError as error:
        return _finish_error(session, notification, error, settings)

    notification.external_action_started_at = _now()
    session.commit()
    try:
        client.send(notification.id, payload)
    except NotificationWebhookError as error:
        return _finish_error(session, notification, error, settings)
    except Exception:
        return _finish_error(
            session,
            notification,
            NotificationWebhookError(
                "notification_internal_error",
                retryable=False,
            ),
            settings,
        )
    return _finish_success(session, notification)


def process_due_notification_outbox(
    session: Session,
    client: NotificationWebhookClient,
    settings: Settings,
    *,
    limit: int,
    worker_id: str | None = None,
) -> list[NotificationOperationResult]:
    settings.validate_phase7_notification_boundary()
    active_worker_id = worker_id or uuid4().hex
    results: list[NotificationOperationResult] = []
    deadline = monotonic() + settings.notification_worker_time_budget_seconds
    for _ in range(min(limit, settings.worker_batch_size)):
        if monotonic() >= deadline:
            break
        notification_id = _claim_next_notification(
            session,
            settings,
            active_worker_id,
        )
        if notification_id is None:
            break
        results.append(
            _process_notification(
                session,
                notification_id,
                client,
                settings,
            )
        )
    return results
