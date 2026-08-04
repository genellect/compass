from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from time import monotonic

from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryMember,
    LibraryOperation,
    LibraryResourceLease,
)
from app.drive_attestation import (
    DRIVE_TARGET_ALIAS,
    DriveOperationAttestationError,
    build_drive_operation_attestation_facts,
    issue_drive_operation_attestation,
    verify_drive_operation_attestation,
)
from app.drive_client import DriveClientError, DrivePermissionClient
from app.observability import emit_event


DRIVE_OPERATION_TYPES = {"drive_grant", "drive_revoke"}
SAFE_ERROR_SUMMARIES = {
    "drive_api_unavailable": "Drive API is temporarily unavailable.",
    "drive_api_retryable_error": "Drive API requested a retry.",
    "drive_auth_transport_error": "Drive OAuth transport is unavailable.",
    "drive_authentication_failed": "Drive OAuth requires operator action.",
    "drive_permission_denied": "Drive rejected the permission operation.",
    "drive_resource_not_found": "The configured Drive resource was not found.",
    "drive_request_rejected": "Drive rejected the request.",
    "drive_request_failed": "The Drive request could not be sent.",
    "drive_invalid_response": "Drive returned an invalid response.",
    "drive_invalid_pagination": "Drive pagination could not be completed.",
    "drive_pagination_limit": "Drive permission pagination exceeded the limit.",
    "permission_not_managed": "The permission is not managed by this system.",
    "operation_state_invalid": "The Drive operation state is invalid.",
    "operation_target_invalid": "The Drive operation target is invalid.",
    "operation_attestation_missing": "Drive operation authorization is missing.",
    "operation_attestation_invalid": "Drive operation authorization is invalid.",
    "operation_attestation_expired": "Drive operation authorization expired.",
    "operation_attestation_replayed": "Drive operation authorization was already used.",
    "member_inactive": "The member is no longer active.",
}


class DriveOperationConflictError(RuntimeError):
    pass


@dataclass(frozen=True)
class DriveOperationResult:
    operation_id: UUID
    status: str
    error_code: str | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def drive_access_status_for_application(
    session: Session,
    application: LibraryApplication,
    _resource_id: str | None = None,
) -> tuple[str, str]:
    approved = (
        application.eligibility_status == "approved"
        or application.admin_decision == "approved"
    )
    if not approved or application.member_id is None:
        return "not_enqueued", "not_applicable"
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == application.member_id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    if grant is None:
        return "not_enqueued", "not_applicable"
    return grant.status, grant.notification_status


def enqueue_drive_revoke(
    session: Session,
    member_id: UUID,
    settings: Settings,
) -> LibraryOperation:
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == member_id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    if grant is None:
        raise DriveOperationConflictError("drive_grant_not_found")
    permission_component = grant.permission_id or "unresolved"
    operation_key = f"drive_revoke:{grant.id}:{permission_component}"
    existing = session.scalar(
        select(LibraryOperation).where(
            LibraryOperation.operation_key == operation_key
        )
    )
    if existing is not None:
        return existing
    operation = LibraryOperation(
        id=uuid4(),
        member_id=member_id,
        operation_key=operation_key,
        operation_type="drive_revoke",
        resource_id=None,
        target_alias=DRIVE_TARGET_ALIAS,
        status="pending",
        max_attempts=3,
    )
    member = session.get(LibraryMember, member_id)
    if member is None or member.normalized_email is None:
        raise DriveOperationConflictError("member_email_unlinked")
    issue_drive_operation_attestation(
        operation,
        facts=build_drive_operation_attestation_facts(
            session,
            operation,
            member,
            grant,
        ),
        key=settings.drive_operation_attestation_key,
    )
    session.add(operation)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        replay = session.scalar(
            select(LibraryOperation).where(
                LibraryOperation.operation_key == operation_key
            )
        )
        if replay is None:
            raise
        return replay
    return operation


def requeue_drive_operation(
    session: Session,
    operation_id: UUID,
    settings: Settings,
) -> LibraryOperation:
    operation = session.get(LibraryOperation, operation_id)
    if (
        operation is None
        or operation.operation_type not in DRIVE_OPERATION_TYPES
    ):
        raise DriveOperationConflictError("drive_operation_not_found")
    if operation.status not in {"failed", "dead"}:
        raise DriveOperationConflictError("drive_operation_not_retryable")

    member = session.get(LibraryMember, operation.member_id)
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == operation.member_id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    if member is None or member.normalized_email is None or grant is None:
        raise DriveOperationConflictError("operation_state_invalid")
    application = None
    if operation.operation_type == "drive_grant":
        application = (
            session.get(LibraryApplication, operation.application_id)
            if operation.application_id is not None
            else None
        )
        if (
            application is None
            or application.member_id != member.id
            or application.normalized_email != member.normalized_email
            or not (
                application.eligibility_status == "approved"
                or application.admin_decision == "approved"
            )
        ):
            raise DriveOperationConflictError("operation_state_invalid")
    elif operation.application_id is not None:
        raise DriveOperationConflictError("operation_state_invalid")

    operation.status = "pending"
    operation.attempt_count = 0
    operation.error_code = None
    operation.error_summary = None
    operation.next_attempt_at = None
    operation.lease_owner = None
    operation.locked_until = None
    operation.completed_at = None
    operation.target_alias = DRIVE_TARGET_ALIAS
    operation.resource_id = None
    try:
        facts = build_drive_operation_attestation_facts(
            session,
            operation,
            member,
            grant,
            application,
        )
    except DriveOperationAttestationError as error:
        raise DriveOperationConflictError(error.code) from error
    issue_drive_operation_attestation(
        operation,
        facts=facts,
        key=settings.drive_operation_attestation_key,
    )
    session.commit()
    return operation


def _claim_next_operation(
    session: Session,
    settings: Settings,
    worker_id: str,
) -> UUID | None:
    now = _now()
    due = or_(
        LibraryOperation.status == "pending",
        and_(
            LibraryOperation.status == "failed",
            or_(
                LibraryOperation.next_attempt_at.is_(None),
                LibraryOperation.next_attempt_at <= now,
            ),
        ),
        and_(
            LibraryOperation.status == "running",
            LibraryOperation.locked_until <= now,
        ),
    )
    operation_id = session.scalar(
        select(LibraryOperation.id)
        .where(
            LibraryOperation.operation_type.in_(DRIVE_OPERATION_TYPES),
            due,
        )
        .order_by(LibraryOperation.created_at, LibraryOperation.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if operation_id is None:
        session.rollback()
        return None
    operation = session.get(LibraryOperation, operation_id)
    if operation is None:
        session.rollback()
        return None
    operation.status = "running"
    operation.lease_owner = worker_id
    operation.locked_until = now + timedelta(
        seconds=settings.phase7_operation_lease_seconds
    )
    operation.error_code = None
    operation.error_summary = None
    operation.next_attempt_at = None
    session.commit()
    return operation_id


def _acquire_resource_lease(
    session: Session,
    resource_id: str,
    worker_id: str,
    settings: Settings,
) -> bool:
    now = _now()
    locked_until = now + timedelta(
        seconds=settings.phase7_resource_lease_seconds
    )
    result = session.execute(
        update(LibraryResourceLease)
        .where(
            LibraryResourceLease.resource_id == resource_id,
            or_(
                LibraryResourceLease.lease_owner.is_(None),
                LibraryResourceLease.locked_until.is_(None),
                LibraryResourceLease.locked_until <= now,
                LibraryResourceLease.lease_owner == worker_id,
            ),
        )
        .values(
            lease_owner=worker_id,
            locked_until=locked_until,
            updated_at=now,
        )
    )
    if result.rowcount == 1:
        session.commit()
        return True
    session.rollback()

    if session.get(LibraryResourceLease, resource_id) is None:
        session.add(
            LibraryResourceLease(
                resource_id=resource_id,
                lease_owner=worker_id,
                locked_until=locked_until,
            )
        )
        try:
            session.commit()
            return True
        except IntegrityError:
            session.rollback()
    return False


def _release_resource_lease(
    session: Session,
    resource_id: str,
    worker_id: str,
) -> None:
    session.execute(
        update(LibraryResourceLease)
        .where(
            LibraryResourceLease.resource_id == resource_id,
            LibraryResourceLease.lease_owner == worker_id,
        )
        .values(
            lease_owner=None,
            locked_until=None,
            updated_at=_now(),
        )
    )
    session.commit()


def _finish_success(
    session: Session,
    operation: LibraryOperation,
) -> DriveOperationResult:
    operation.status = "succeeded"
    operation.error_code = None
    operation.error_summary = None
    operation.next_attempt_at = None
    operation.lease_owner = None
    operation.locked_until = None
    operation.completed_at = _now()
    session.commit()
    return DriveOperationResult(operation.id, operation.status)


def _finish_error(
    session: Session,
    operation: LibraryOperation,
    error: DriveClientError,
    settings: Settings,
    grant: LibraryAccessGrant | None,
) -> DriveOperationResult:
    retryable = error.retryable and operation.attempt_count < operation.max_attempts
    operation.status = "failed" if retryable else "dead"
    operation.error_code = error.code
    operation.error_summary = SAFE_ERROR_SUMMARIES.get(
        error.code,
        "Drive operation failed.",
    )
    operation.lease_owner = None
    operation.locked_until = None
    operation.completed_at = None if retryable else _now()
    if retryable:
        member = session.get(LibraryMember, operation.member_id)
        application = (
            session.get(LibraryApplication, operation.application_id)
            if operation.application_id is not None
            else None
        )
        try:
            if member is None or grant is None:
                raise DriveOperationAttestationError(
                    "operation_state_invalid"
                )
            facts = build_drive_operation_attestation_facts(
                session,
                operation,
                member,
                grant,
                application,
            )
        except DriveOperationAttestationError:
            retryable = False
            operation.status = "dead"
            operation.error_code = "operation_attestation_invalid"
            operation.error_summary = SAFE_ERROR_SUMMARIES[
                "operation_attestation_invalid"
            ]
            operation.completed_at = _now()
            operation.next_attempt_at = None
        else:
            issue_drive_operation_attestation(
                operation,
                facts=facts,
                key=settings.drive_operation_attestation_key,
            )
    if retryable:
        delay = min(
            settings.phase7_retry_base_seconds
            * (2 ** max(operation.attempt_count - 1, 0)),
            3600,
        )
        operation.next_attempt_at = _now() + timedelta(seconds=delay)
    else:
        operation.next_attempt_at = None
        if grant is not None and operation.operation_type == "drive_grant":
            grant.status = "failed"
            grant.notification_status = "failed"
    operation_id = operation.id
    operation_status = operation.status
    operation_type = operation.operation_type
    session.commit()
    if operation_status == "dead":
        emit_event(
            "drive_operation_dead",
            operation_type=operation_type,
            error_code=operation.error_code,
        )
    return DriveOperationResult(
        operation_id,
        operation_status,
        operation.error_code,
    )


def _defer_for_resource_lock(
    session: Session,
    operation: LibraryOperation,
    settings: Settings,
) -> DriveOperationResult:
    operation.status = "failed"
    operation.error_code = "resource_busy"
    operation.error_summary = "Another Drive operation owns the resource lease."
    operation.next_attempt_at = _now() + timedelta(
        seconds=settings.phase7_retry_base_seconds
    )
    operation.lease_owner = None
    operation.locked_until = None
    session.commit()
    return DriveOperationResult(operation.id, operation.status, "resource_busy")


def _process_grant(
    session: Session,
    operation: LibraryOperation,
    member: LibraryMember,
    grant: LibraryAccessGrant,
    client: DrivePermissionClient,
    settings: Settings,
    target_resource_id: str,
) -> DriveOperationResult:
    locked_member = session.scalar(
        select(LibraryMember)
        .where(LibraryMember.id == member.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    locked_grant = session.scalar(
        select(LibraryAccessGrant)
        .where(LibraryAccessGrant.id == grant.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        locked_member is None
        or locked_member.member_status != "active"
        or locked_grant is None
    ):
        raise DriveClientError("member_inactive", retryable=False)
    if locked_member.normalized_email is None:
        raise DriveClientError("member_email_unlinked", retryable=False)
    try:
        application = (
            session.get(LibraryApplication, operation.application_id)
            if operation.application_id is not None
            else None
        )
        facts = build_drive_operation_attestation_facts(
            session,
            operation,
            locked_member,
            locked_grant,
            application,
        )
        verify_drive_operation_attestation(
            operation,
            facts=facts,
            key=settings.drive_operation_attestation_key,
            ttl_seconds=settings.drive_operation_attestation_ttl_seconds,
            allow_consumed=True,
        )
    except DriveOperationAttestationError as error:
        raise DriveClientError(error.code, retryable=False) from error
    existing = client.find_permission(
        target_resource_id,
        locked_member.normalized_email,
    )
    if existing is not None:
        # A permission found after a lost create response cannot be proven to
        # have been created by this system; an operator may have added it in
        # the meantime. Preserve it as unmanaged unless its ownership was
        # recorded from a successful create response in an earlier attempt.
        system_managed = locked_grant.managed_by_system
        locked_grant.permission_id = existing.permission_id
        locked_grant.role = existing.role
        locked_grant.status = (
            "granted" if system_managed else "already_granted"
        )
        locked_grant.managed_by_system = system_managed
        locked_grant.granted_at = locked_grant.granted_at or _now()
        if system_managed:
            locked_grant.notification_status = "sent_by_drive"
            locked_grant.notification_sent_at = (
                locked_grant.notification_sent_at
                or operation.external_action_started_at
                or _now()
            )
        else:
            locked_grant.notification_status = "not_applicable"
        return _finish_success(session, operation)

    operation.external_action_started_at = _now()
    session.commit()
    # The worker and admin mutation paths lock the same member row. This makes
    # a pending grant and a concurrent deactivate/revoke action linearizable:
    # whichever obtains the lock first completes its decision first.
    locked_member_after_marker = session.scalar(
        select(LibraryMember)
        .where(LibraryMember.id == member.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    locked_grant_after_marker = session.scalar(
        select(LibraryAccessGrant)
        .where(LibraryAccessGrant.id == grant.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        locked_member_after_marker is None
        or locked_member_after_marker.member_status != "active"
        or locked_grant_after_marker is None
    ):
        raise DriveClientError("member_inactive", retryable=False)
    if locked_member_after_marker.normalized_email is None:
        raise DriveClientError("member_email_unlinked", retryable=False)
    try:
        application_after_marker = (
            session.get(LibraryApplication, operation.application_id)
            if operation.application_id is not None
            else None
        )
        facts_after_marker = build_drive_operation_attestation_facts(
            session,
            operation,
            locked_member_after_marker,
            locked_grant_after_marker,
            application_after_marker,
        )
        verify_drive_operation_attestation(
            operation,
            facts=facts_after_marker,
            key=settings.drive_operation_attestation_key,
            ttl_seconds=settings.drive_operation_attestation_ttl_seconds,
            allow_consumed=True,
        )
    except DriveOperationAttestationError as error:
        raise DriveClientError(error.code, retryable=False) from error
    created = client.create_reader_permission(
        target_resource_id,
        locked_member_after_marker.normalized_email,
    )
    locked_grant_after_marker.permission_id = created.permission_id
    locked_grant_after_marker.role = created.role
    locked_grant_after_marker.status = "granted"
    locked_grant_after_marker.managed_by_system = True
    locked_grant_after_marker.granted_at = _now()
    locked_grant_after_marker.revoked_at = None
    locked_grant_after_marker.notification_status = "sent_by_drive"
    locked_grant_after_marker.notification_sent_at = _now()
    return _finish_success(session, operation)


def _process_revoke(
    session: Session,
    operation: LibraryOperation,
    member: LibraryMember,
    grant: LibraryAccessGrant,
    client: DrivePermissionClient,
    settings: Settings,
    target_resource_id: str,
) -> DriveOperationResult:
    locked_member = session.scalar(
        select(LibraryMember)
        .where(LibraryMember.id == member.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    locked_grant = session.scalar(
        select(LibraryAccessGrant)
        .where(LibraryAccessGrant.id == grant.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        locked_member is None
        or locked_member.normalized_email is None
        or locked_grant is None
    ):
        raise DriveClientError("operation_state_invalid", retryable=False)
    try:
        facts = build_drive_operation_attestation_facts(
            session,
            operation,
            locked_member,
            locked_grant,
        )
        verify_drive_operation_attestation(
            operation,
            facts=facts,
            key=settings.drive_operation_attestation_key,
            ttl_seconds=settings.drive_operation_attestation_ttl_seconds,
            allow_consumed=True,
        )
    except DriveOperationAttestationError as error:
        raise DriveClientError(error.code, retryable=False) from error
    if locked_grant.status == "revoked":
        return _finish_success(session, operation)
    if not locked_grant.managed_by_system:
        raise DriveClientError("permission_not_managed", retryable=False)
    permission_id = locked_grant.permission_id
    if not permission_id:
        raise DriveClientError("operation_state_invalid", retryable=False)

    # Never trust a database permission ID as authority to delete. Resolve the
    # permission for the attested email on the worker-only target and require
    # an exact match with the permission previously recorded as system-owned.
    existing = client.find_permission(
        target_resource_id,
        locked_member.normalized_email,
    )
    if existing is None:
        locked_grant.status = "revoked"
        locked_grant.revoked_at = _now()
        return _finish_success(session, operation)
    if existing.permission_id != permission_id:
        raise DriveClientError("permission_not_managed", retryable=False)

    operation.external_action_started_at = _now()
    session.commit()
    client.delete_permission(target_resource_id, permission_id)
    locked_grant.status = "revoked"
    locked_grant.revoked_at = _now()
    return _finish_success(session, operation)


def _process_operation(
    session: Session,
    operation_id: UUID,
    client: DrivePermissionClient,
    settings: Settings,
    worker_id: str,
) -> DriveOperationResult:
    operation = session.get(LibraryOperation, operation_id)
    if operation is None:
        raise DriveOperationConflictError("operation_not_found")
    member = session.get(LibraryMember, operation.member_id)
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == operation.member_id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    if member is None or grant is None:
        return _finish_error(
            session,
            operation,
            DriveClientError("operation_state_invalid", retryable=False),
            settings,
            grant,
        )
    if (
        operation.target_alias != DRIVE_TARGET_ALIAS
        or grant.target_alias != DRIVE_TARGET_ALIAS
    ):
        return _finish_error(
            session,
            operation,
            DriveClientError("operation_target_invalid", retryable=False),
            settings,
            grant,
        )
    if member.normalized_email is None:
        return _finish_error(
            session,
            operation,
            DriveClientError("member_email_unlinked", retryable=False),
            settings,
            grant,
        )
    application = None
    if operation.operation_type == "drive_grant":
        if member.member_status != "active":
            return _finish_error(
                session,
                operation,
                DriveClientError("member_inactive", retryable=False),
                settings,
                grant,
            )
        application = (
            session.get(LibraryApplication, operation.application_id)
            if operation.application_id is not None
            else None
        )
    elif operation.operation_type == "drive_revoke":
        if operation.application_id is not None:
            return _finish_error(
                session,
                operation,
                DriveClientError("operation_state_invalid", retryable=False),
                settings,
                grant,
            )
    else:
        return _finish_error(
            session,
            operation,
            DriveClientError("operation_state_invalid", retryable=False),
            settings,
            grant,
        )

    try:
        facts = build_drive_operation_attestation_facts(
            session,
            operation,
            member,
            grant,
            application,
        )
        verify_drive_operation_attestation(
            operation,
            facts=facts,
            key=settings.drive_operation_attestation_key,
            ttl_seconds=settings.drive_operation_attestation_ttl_seconds,
        )
    except DriveOperationAttestationError as error:
        return _finish_error(
            session,
            operation,
            DriveClientError(error.code, retryable=False),
            settings,
            grant,
        )

    if not _acquire_resource_lease(
        session,
        settings.drive_resource_id,
        worker_id,
        settings,
    ):
        return _defer_for_resource_lock(session, operation, settings)

    try:
        # Consume before any Drive API call. A crash after this marker requires
        # explicit operator re-attestation instead of replaying authority.
        operation.attestation_consumed_at = _now()
        operation.attempt_count += 1
        session.commit()
        if operation.operation_type == "drive_grant":
            return _process_grant(
                session,
                operation,
                member,
                grant,
                client,
                settings,
                settings.drive_resource_id,
            )
        if operation.operation_type == "drive_revoke":
            return _process_revoke(
                session,
                operation,
                member,
                grant,
                client,
                settings,
                settings.drive_resource_id,
            )
        return _finish_error(
            session,
            operation,
            DriveClientError("operation_state_invalid", retryable=False),
            settings,
            grant,
        )
    except DriveClientError as error:
        return _finish_error(
            session,
            operation,
            error,
            settings,
            grant,
        )
    finally:
        _release_resource_lease(
            session,
            settings.drive_resource_id,
            worker_id,
        )


def process_due_drive_operations(
    session: Session,
    client: DrivePermissionClient,
    settings: Settings,
    *,
    limit: int,
    worker_id: str | None = None,
) -> list[DriveOperationResult]:
    active_worker_id = worker_id or uuid4().hex
    results: list[DriveOperationResult] = []
    deadline = monotonic() + settings.worker_time_budget_seconds
    for _ in range(min(limit, settings.worker_batch_size)):
        if monotonic() >= deadline:
            break
        operation_id = _claim_next_operation(
            session,
            settings,
            active_worker_id,
        )
        if operation_id is None:
            break
        results.append(
            _process_operation(
                session,
                operation_id,
                client,
                settings,
                active_worker_id,
            )
        )
    return results
