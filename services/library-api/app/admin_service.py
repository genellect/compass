from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import json
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryAdmin,
    LibraryAdminAudit,
    LibraryApplication,
    LibraryMember,
    LibraryOperation,
)
from app.drive_attestation import (
    DRIVE_TARGET_ALIAS,
    DriveOperationAttestationError,
    build_drive_operation_attestation_facts,
    issue_drive_operation_attestation,
)
from app.eligibility import is_student_number_valid
from app.schemas import (
    AdminApplicationItem,
    AdminAuditItem,
    AdminDecisionRequest,
    AdminMutationResponse,
    AdminMemberItem,
    AdminRetryRequest,
    AdminRevokeRequest,
)
from app.roster import roster_grade_label, roster_grade_rank_expression


ROLE_LEVEL = {"viewer": 0, "operator": 1, "admin": 2}
APPROVABLE_MANUAL_REASONS = {
    "role_requires_manual_review",
    "non_student_email_requires_manual_review",
}


class AdminAccessError(RuntimeError):
    pass


class AdminConflictError(RuntimeError):
    pass


class AdminNotFoundError(RuntimeError):
    pass


@dataclass(frozen=True)
class AdminPrincipal:
    admin_id: UUID
    role: str


def _member_for_update(session: Session, member_id: UUID) -> LibraryMember | None:
    """Serialize state-changing admin actions with Drive worker grants."""
    return session.scalar(
        select(LibraryMember)
        .where(LibraryMember.id == member_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def require_admin(
    session: Session,
    identity: VerifiedGoogleIdentity,
    *,
    minimum_role: str = "viewer",
) -> AdminPrincipal:
    admin = session.scalar(
        select(LibraryAdmin).where(
            LibraryAdmin.google_sub == identity.google_sub,
            LibraryAdmin.active.is_(True),
        )
    )
    if admin is None or ROLE_LEVEL.get(admin.role, -1) < ROLE_LEVEL[minimum_role]:
        raise AdminAccessError("admin_access_denied")
    return AdminPrincipal(admin_id=admin.id, role=admin.role)


def _drive_state(
    session: Session,
    application: LibraryApplication,
    settings: Settings,
) -> tuple[str, bool, str | None, UUID | None, int | None, str | None]:
    if application.member_id is None:
        return "not_enqueued", False, None, None, None, None
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == application.member_id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    operation = session.scalar(
        select(LibraryOperation)
        .where(LibraryOperation.application_id == application.id)
        .order_by(LibraryOperation.created_at.desc())
        .limit(1)
    )
    return (
        grant.status if grant is not None else "not_enqueued",
        grant.managed_by_system if grant is not None else False,
        operation.status if operation is not None else None,
        operation.id if operation is not None else None,
        operation.record_version if operation is not None else None,
        operation.error_code if operation is not None else None,
    )


def application_item(
    session: Session,
    application: LibraryApplication,
    settings: Settings,
) -> AdminApplicationItem:
    member = session.get(LibraryMember, application.member_id)
    (
        drive_status,
        drive_permission_managed,
        operation_status,
        operation_id,
        operation_record_version,
        operation_error_code,
    ) = _drive_state(session, application, settings)
    return AdminApplicationItem(
        application_id=application.id,
        member_id=application.member_id,
        operation_id=operation_id,
        full_name=application.full_name,
        email=application.normalized_email,
        student_number=application.normalized_student_number,
        academic_role=application.academic_role,
        faculty_code=application.faculty_code,
        grade=application.grade,
        eligibility_status=application.eligibility_status,
        reason_codes=list(application.reason_codes),
        admin_decision=application.admin_decision,
        record_version=application.record_version,
        member_status=member.member_status if member is not None else None,
        member_record_version=member.record_version if member is not None else None,
        drive_access_status=drive_status,
        drive_permission_managed=drive_permission_managed,
        operation_status=operation_status,
        operation_record_version=operation_record_version,
        operation_error_code=operation_error_code,
        created_at=application.created_at,
    )


def list_applications(
    session: Session,
    settings: Settings,
    *,
    decision: str | None,
    drive_status: str | None,
    query: str | None,
    offset: int,
    limit: int,
) -> tuple[list[AdminApplicationItem], bool]:
    statement = select(LibraryApplication)
    if decision:
        statement = statement.where(LibraryApplication.admin_decision == decision)
    if drive_status:
        statement = statement.outerjoin(
            LibraryAccessGrant,
            and_(
                LibraryAccessGrant.member_id == LibraryApplication.member_id,
                LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
            ),
        )
        if drive_status == "not_enqueued":
            statement = statement.where(LibraryAccessGrant.id.is_(None))
        else:
            statement = statement.where(LibraryAccessGrant.status == drive_status)
    normalized_query = (query or "").strip().lower()
    if normalized_query:
        like = f"%{normalized_query}%"
        statement = statement.where(
            or_(
                func.lower(LibraryApplication.full_name).like(like),
                LibraryApplication.normalized_email.like(like),
                LibraryApplication.normalized_student_number.like(like),
            )
        )
    rows = list(
        session.scalars(
            statement.order_by(
                LibraryApplication.created_at.desc(),
                LibraryApplication.id,
            ).offset(offset).limit(limit + 1)
        )
    )
    return [application_item(session, item, settings) for item in rows[:limit]], len(rows) > limit


def list_members(
    session: Session,
    *,
    query: str | None,
    grade: str | None,
    member_status: str,
    sort_by: str,
    sort_direction: str,
    offset: int,
    limit: int,
) -> tuple[list[AdminMemberItem], bool]:
    statement = select(LibraryMember)
    if member_status != "all":
        statement = statement.where(LibraryMember.member_status == member_status)

    normalized_query = (query or "").strip().lower()
    if normalized_query:
        like = f"%{normalized_query}%"
        statement = statement.where(
            or_(
                func.lower(LibraryMember.full_name).like(like),
                LibraryMember.normalized_student_number.like(like.upper()),
            )
        )

    grade_rank = roster_grade_rank_expression()
    if grade and grade.endswith("年"):
        statement = statement.where(
            LibraryMember.academic_role == "undergraduate",
            LibraryMember.grade == grade.removesuffix("年"),
        )
    elif grade in {"M1", "M2"}:
        statement = statement.where(
            LibraryMember.academic_role == "master",
            LibraryMember.grade == grade[-1],
        )
    elif grade == "その他":
        statement = statement.where(grade_rank == 9)

    primary = {
        "grade": grade_rank,
        "student_number": LibraryMember.normalized_student_number,
        "registered_at": LibraryMember.registered_at,
    }[sort_by]
    primary_order = primary.desc().nulls_last() if sort_direction == "desc" else primary.asc().nulls_last()
    statement = statement.order_by(
        primary_order,
        grade_rank.asc(),
        LibraryMember.normalized_student_number.asc().nulls_last(),
        LibraryMember.registered_at.asc().nulls_last(),
        LibraryMember.id,
    )
    rows = list(session.scalars(statement.offset(offset).limit(limit + 1)))
    return (
        [
            AdminMemberItem(
                member_id=member.id,
                full_name=member.full_name,
                grade=roster_grade_label(member.academic_role, member.grade),
                student_number=member.normalized_student_number,
                registered_at=member.registered_at,
                member_status=member.member_status,
                record_version=member.record_version,
            )
            for member in rows[:limit]
        ],
        len(rows) > limit,
    )


def _get_application(session: Session, application_id: UUID) -> LibraryApplication:
    application = session.get(LibraryApplication, application_id)
    if application is None:
        raise AdminNotFoundError("application_not_found")
    return application


def _existing_audit(session: Session, action_key: str) -> LibraryAdminAudit | None:
    return session.scalar(
        select(LibraryAdminAudit).where(LibraryAdminAudit.action_key == action_key)
    )


def _action_key(scope: str, idempotency_key: str) -> str:
    return hashlib.sha256(f"{scope}:{idempotency_key}".encode("utf-8")).hexdigest()


def _action_fingerprint(
    principal: AdminPrincipal,
    scope: str,
    request: AdminDecisionRequest | AdminRetryRequest | AdminRevokeRequest,
) -> str:
    payload = {
        "actor_admin_id": str(principal.admin_id),
        "scope": scope,
        "request": request.model_dump(mode="json"),
    }
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _idempotent_audit(
    session: Session,
    action_key: str,
    request_fingerprint: str,
) -> LibraryAdminAudit | None:
    existing = _existing_audit(session, action_key)
    if existing is None:
        return None
    stored_fingerprint = (existing.metadata_json or {}).get("request_fingerprint")
    if stored_fingerprint != request_fingerprint:
        raise AdminConflictError("idempotency_payload_mismatch")
    return existing


def _audit(
    session: Session,
    principal: AdminPrincipal,
    *,
    action: str,
    action_key: str,
    reason: str,
    request_id: str,
    member_id: UUID | None = None,
    application_id: UUID | None = None,
    operation_id: UUID | None = None,
    metadata: dict[str, str | int] | None = None,
) -> None:
    session.add(
        LibraryAdminAudit(
            admin_id=principal.admin_id,
            action=action,
            action_key=action_key,
            actor_role=principal.role,
            result="accepted",
            request_id=request_id,
            member_id=member_id,
            application_id=application_id,
            operation_id=operation_id,
            reason=reason.strip(),
            metadata_json=metadata or {},
        )
    )


def _manual_approval_is_safe(application: LibraryApplication) -> bool:
    reasons = set(application.reason_codes)
    if application.eligibility_status != "manual_review":
        return False
    if application.faculty_code != "pharmacy":
        return False
    if not reasons or not reasons.issubset(APPROVABLE_MANUAL_REASONS):
        return False
    if application.privacy_accepted_at is None:
        return False
    if application.academic_role in {"undergraduate", "master"}:
        return bool(
            application.grade
            and application.terms_accepted_at
            and application.normalized_student_number
            and is_student_number_valid(application.normalized_student_number)
        )
    return application.academic_role in {"doctoral", "staff"}


def decide_application(
    session: Session,
    settings: Settings,
    principal: AdminPrincipal,
    application_id: UUID,
    request: AdminDecisionRequest,
    *,
    idempotency_key: str,
    request_id: str,
) -> AdminMutationResponse:
    scope = f"application-decision:{application_id}"
    action_key = _action_key(scope, idempotency_key)
    request_fingerprint = _action_fingerprint(principal, scope, request)
    if _idempotent_audit(session, action_key, request_fingerprint) is not None:
        application = _get_application(session, application_id)
        return AdminMutationResponse(
            status=application.admin_decision,
            application_id=application.id,
            member_id=application.member_id,
            record_version=application.record_version,
        )
    application = _get_application(session, application_id)
    if application.record_version != request.expected_record_version:
        raise AdminConflictError("stale_record")
    if application.admin_decision != "pending":
        raise AdminConflictError("application_already_decided")
    member = _member_for_update(session, application.member_id)
    if member is None:
        raise AdminConflictError("application_member_missing")

    previous_version = application.record_version
    now = datetime.now(UTC)
    if request.decision == "approve":
        if not _manual_approval_is_safe(application):
            raise AdminConflictError("manual_approval_not_permitted")
        if member.normalized_email is None:
            raise AdminConflictError("member_email_unlinked")
        application.admin_decision = "approved"
        member.member_status = "active"
        grant = session.scalar(
            select(LibraryAccessGrant).where(
                LibraryAccessGrant.member_id == member.id,
                LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
            )
        )
        if grant is None:
            grant = LibraryAccessGrant(
                member_id=member.id,
                resource_id=DRIVE_TARGET_ALIAS,
                target_alias=DRIVE_TARGET_ALIAS,
                role="reader",
                status="pending",
                managed_by_system=False,
                notification_status="pending",
            )
            session.add(grant)
        operation_key = f"drive_grant:{member.id}:{DRIVE_TARGET_ALIAS}"
        operation = session.scalar(
            select(LibraryOperation).where(
                LibraryOperation.operation_key == operation_key
            )
        )
        if operation is None:
            operation = LibraryOperation(
                id=uuid4(),
                member_id=member.id,
                application_id=application.id,
                operation_key=operation_key,
                operation_type="drive_grant",
                resource_id=None,
                target_alias=DRIVE_TARGET_ALIAS,
                status="pending",
                max_attempts=3,
            )
            session.flush()
            try:
                facts = build_drive_operation_attestation_facts(
                    session,
                    operation,
                    member,
                    grant,
                    application,
                )
            except DriveOperationAttestationError as error:
                raise AdminConflictError(error.code) from error
            issue_drive_operation_attestation(
                operation,
                facts=facts,
                key=settings.drive_operation_attestation_key,
            )
            session.add(operation)
    else:
        application.admin_decision = "rejected"
        application.retention_until = now + timedelta(days=90)
        # A conflict application can point at a pre-existing active member.
        # Rejecting the new application must not deactivate that valid record.
        if member.member_status == "pending_review":
            member.member_status = "inactive"
            member.deactivated_at = now

    application.decision_reason = request.reason.strip()
    application.decided_at = now
    application.decided_by_admin_id = principal.admin_id
    _audit(
        session,
        principal,
        action=f"application_{request.decision}",
        action_key=action_key,
        reason=request.reason,
        request_id=request_id,
        member_id=member.id,
        application_id=application.id,
        metadata={
            "decision": request.decision,
            "expected_record_version": previous_version,
            "request_fingerprint": request_fingerprint,
        },
    )
    try:
        session.commit()
    except (IntegrityError, StaleDataError) as error:
        session.rollback()
        raise AdminConflictError("stale_record") from error
    return AdminMutationResponse(
        status=application.admin_decision,
        application_id=application.id,
        member_id=member.id,
        record_version=application.record_version,
    )


def retry_operation(
    session: Session,
    settings: Settings,
    principal: AdminPrincipal,
    operation_id: UUID,
    request: AdminRetryRequest,
    *,
    idempotency_key: str,
    request_id: str,
) -> AdminMutationResponse:
    scope = f"operation-retry:{operation_id}"
    action_key = _action_key(scope, idempotency_key)
    request_fingerprint = _action_fingerprint(principal, scope, request)
    if _idempotent_audit(session, action_key, request_fingerprint) is not None:
        operation = session.get(LibraryOperation, operation_id)
        if operation is None:
            raise AdminNotFoundError("operation_not_found")
        return AdminMutationResponse(
            status=operation.status,
            operation_id=operation.id,
            member_id=operation.member_id,
            record_version=operation.record_version,
        )
    operation = session.get(LibraryOperation, operation_id)
    if operation is None:
        raise AdminNotFoundError("operation_not_found")
    if operation.record_version != request.expected_record_version:
        raise AdminConflictError("stale_record")
    if operation.status not in {"failed", "dead"}:
        raise AdminConflictError("drive_operation_not_retryable")
    member = session.get(LibraryMember, operation.member_id)
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == operation.member_id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    if member is None or member.normalized_email is None or grant is None:
        raise AdminConflictError("operation_state_invalid")
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
            raise AdminConflictError("operation_state_invalid")
    elif operation.operation_type != "drive_revoke" or operation.application_id is not None:
        raise AdminConflictError("operation_state_invalid")
    operation.status = "pending"
    operation.attempt_count = 0
    operation.error_code = None
    operation.error_summary = None
    operation.next_attempt_at = None
    operation.lease_owner = None
    operation.locked_until = None
    operation.completed_at = None
    operation.resource_id = None
    operation.target_alias = DRIVE_TARGET_ALIAS
    try:
        facts = build_drive_operation_attestation_facts(
            session,
            operation,
            member,
            grant,
            application,
        )
    except DriveOperationAttestationError as error:
        raise AdminConflictError(error.code) from error
    issue_drive_operation_attestation(
        operation,
        facts=facts,
        key=settings.drive_operation_attestation_key,
    )
    _audit(
        session,
        principal,
        action="operation_retry",
        action_key=action_key,
        reason=request.reason,
        request_id=request_id,
        member_id=operation.member_id,
        application_id=operation.application_id,
        operation_id=operation.id,
        metadata={
            "expected_record_version": request.expected_record_version,
            "request_fingerprint": request_fingerprint,
        },
    )
    try:
        session.commit()
    except (IntegrityError, StaleDataError) as error:
        session.rollback()
        raise AdminConflictError("stale_record") from error
    return AdminMutationResponse(
        status="pending",
        operation_id=operation.id,
        member_id=operation.member_id,
        record_version=operation.record_version,
    )


def _cancel_unfinished_grants(
    session: Session,
    member_id: UUID,
    now: datetime,
) -> int:
    unfinished_grants = list(
        session.scalars(
            select(LibraryOperation).where(
                LibraryOperation.member_id == member_id,
                LibraryOperation.operation_type == "drive_grant",
                LibraryOperation.status.in_(("pending", "failed")),
            )
        )
    )
    for operation in unfinished_grants:
        operation.status = "dead"
        operation.error_code = "member_inactive"
        operation.error_summary = (
            "Drive grant cancelled because the member was deactivated."
        )
        operation.next_attempt_at = None
        operation.lease_owner = None
        operation.locked_until = None
        operation.completed_at = now
    if unfinished_grants:
        legacy_resource_ids = {
            operation.resource_id
            for operation in unfinished_grants
            if operation.resource_id
        }
        grant_target_predicate = (
            or_(
                LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
                LibraryAccessGrant.resource_id.in_(legacy_resource_ids),
            )
            if legacy_resource_ids
            else LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS
        )
        grants = list(
            session.scalars(
                select(LibraryAccessGrant).where(
                    LibraryAccessGrant.member_id == member_id,
                    grant_target_predicate,
                    LibraryAccessGrant.status.in_(("pending", "failed")),
                )
            )
        )
        for grant in grants:
            grant.status = "failed"
            if grant.notification_status == "pending":
                grant.notification_status = "failed"
    return len(unfinished_grants)


def revoke_member(
    session: Session,
    settings: Settings,
    principal: AdminPrincipal,
    member_id: UUID,
    request: AdminRevokeRequest,
    *,
    idempotency_key: str,
    request_id: str,
) -> AdminMutationResponse:
    if request.confirmed_member_id != member_id:
        raise AdminConflictError("member_confirmation_mismatch")
    scope = f"member-revoke:{member_id}"
    action_key = _action_key(scope, idempotency_key)
    request_fingerprint = _action_fingerprint(principal, scope, request)
    existing_audit = _idempotent_audit(
        session,
        action_key,
        request_fingerprint,
    )
    if existing_audit is not None:
        operation = session.get(LibraryOperation, existing_audit.operation_id)
        return AdminMutationResponse(
            status=operation.status if operation else "pending",
            member_id=member_id,
            operation_id=operation.id if operation else None,
        )
    member = _member_for_update(session, member_id)
    if member is None:
        raise AdminNotFoundError("member_not_found")
    if member.record_version != request.expected_record_version:
        raise AdminConflictError("stale_record")
    if member.normalized_email is None:
        raise AdminConflictError("member_email_unlinked")
    grant = session.scalar(
        select(LibraryAccessGrant).where(
            LibraryAccessGrant.member_id == member.id,
            LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
        )
    )
    if grant is None:
        raise AdminConflictError("drive_grant_not_found")
    if not grant.managed_by_system:
        raise AdminConflictError("permission_not_managed")
    permission_component = grant.permission_id or "unresolved"
    operation_key = f"drive_revoke:{grant.id}:{permission_component}"
    operation = session.scalar(
        select(LibraryOperation).where(
            LibraryOperation.operation_key == operation_key
        )
    )
    if operation is None:
        operation = LibraryOperation(
            id=uuid4(),
            member_id=member.id,
            operation_key=operation_key,
            operation_type="drive_revoke",
            resource_id=None,
            target_alias=DRIVE_TARGET_ALIAS,
            status="pending",
            max_attempts=3,
        )
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
        session.flush()
    now = datetime.now(UTC)
    cancelled_grant_count = _cancel_unfinished_grants(
        session,
        member.id,
        now,
    )
    member.member_status = "inactive"
    member.deactivated_at = now
    _audit(
        session,
        principal,
        action="member_deactivate_and_revoke",
        action_key=action_key,
        reason=request.reason,
        request_id=request_id,
        member_id=member.id,
        operation_id=operation.id,
        metadata={
            "expected_record_version": request.expected_record_version,
            "cancelled_grant_count": cancelled_grant_count,
            "request_fingerprint": request_fingerprint,
        },
    )
    try:
        session.commit()
    except (IntegrityError, StaleDataError) as error:
        session.rollback()
        raise AdminConflictError("stale_record") from error
    return AdminMutationResponse(
        status=operation.status,
        member_id=member.id,
        operation_id=operation.id,
        record_version=member.record_version,
    )


def deactivate_member(
    session: Session,
    principal: AdminPrincipal,
    member_id: UUID,
    request: AdminRevokeRequest,
    *,
    idempotency_key: str,
    request_id: str,
) -> AdminMutationResponse:
    if request.confirmed_member_id != member_id:
        raise AdminConflictError("member_confirmation_mismatch")
    scope = f"member-deactivate:{member_id}"
    action_key = _action_key(scope, idempotency_key)
    request_fingerprint = _action_fingerprint(principal, scope, request)
    if _idempotent_audit(session, action_key, request_fingerprint) is not None:
        member = session.get(LibraryMember, member_id)
        if member is None:
            raise AdminNotFoundError("member_not_found")
        return AdminMutationResponse(
            status=member.member_status,
            member_id=member.id,
            record_version=member.record_version,
        )

    member = _member_for_update(session, member_id)
    if member is None:
        raise AdminNotFoundError("member_not_found")
    if member.record_version != request.expected_record_version:
        raise AdminConflictError("stale_record")
    if member.member_status == "inactive":
        raise AdminConflictError("member_already_inactive")

    now = datetime.now(UTC)
    cancelled_grant_count = _cancel_unfinished_grants(
        session,
        member.id,
        now,
    )

    member.member_status = "inactive"
    member.deactivated_at = now
    _audit(
        session,
        principal,
        action="member_deactivate",
        action_key=action_key,
        reason=request.reason,
        request_id=request_id,
        member_id=member.id,
        metadata={
            "expected_record_version": request.expected_record_version,
            "cancelled_grant_count": cancelled_grant_count,
            "request_fingerprint": request_fingerprint,
        },
    )
    try:
        session.commit()
    except (IntegrityError, StaleDataError) as error:
        session.rollback()
        raise AdminConflictError("stale_record") from error
    return AdminMutationResponse(
        status=member.member_status,
        member_id=member.id,
        record_version=member.record_version,
    )


def list_audit(
    session: Session,
    *,
    offset: int,
    limit: int,
) -> tuple[list[AdminAuditItem], bool]:
    rows = list(
        session.scalars(
            select(LibraryAdminAudit)
            .order_by(LibraryAdminAudit.created_at.desc(), LibraryAdminAudit.id)
            .offset(offset)
            .limit(limit + 1)
        )
    )
    items = [
        AdminAuditItem(
            audit_id=row.id,
            action=row.action,
            actor_role=row.actor_role,
            result=row.result,
            member_id=row.member_id,
            application_id=row.application_id,
            operation_id=row.operation_id,
            reason=row.reason,
            request_id=row.request_id,
            created_at=row.created_at,
        )
        for row in rows[:limit]
    ]
    return items, len(rows) > limit
