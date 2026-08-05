from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import json
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import VerifiedGoogleIdentity
from app.config import Settings, get_settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryIdentity,
    LibraryMember,
    LibraryOperation,
)
from app.drive_attestation import (
    DRIVE_TARGET_ALIAS,
    build_drive_operation_attestation_facts,
    issue_drive_operation_attestation,
)
from app.drive_operations import drive_access_status_for_application
from app.eligibility import (
    evaluate_eligibility,
    normalize_email,
    normalize_student_number,
)
from app.notification_outbox import enqueue_manual_review_notification
from app.public_registration_rpc import (
    PublicRegistrationRpcBoundaryError,
    PublicRegistrationRpcConflictError,
    persist_public_registration_v1,
)
from app.schemas import (
    AccountFacts,
    EligibilityResponse,
    EligibilityStatus,
    ExistingRegistration,
    ReasonCode,
    RegistrationInput,
)


AUTHENTICATION_FAILURES = {
    ReasonCode.ACCOUNT_NOT_VERIFIED,
    ReasonCode.TOKEN_INVALID,
    ReasonCode.EMAIL_NOT_VERIFIED,
    ReasonCode.HOSTED_DOMAIN_NOT_ALLOWED,
    ReasonCode.EMAIL_DOMAIN_NOT_ALLOWED,
}


class PersistenceConflictError(RuntimeError):
    pass


@dataclass(frozen=True)
class RegistrationPersistenceResult:
    eligibility: EligibilityResponse
    persisted: bool
    replayed: bool
    application_id: UUID | None = None
    member_id: UUID | None = None
    identity_linked: bool = False
    drive_access_status: str = "not_enqueued"
    drive_notification_status: str = "not_applicable"


def _find_application(
    session: Session,
    idempotency_key: str,
    authentication_subject_hash: str | None = None,
    request_fingerprint: str | None = None,
) -> LibraryApplication | None:
    application = session.scalar(
        select(LibraryApplication).where(
            LibraryApplication.idempotency_key == idempotency_key
        )
    )
    if (
        application is not None
        and authentication_subject_hash is not None
        and application.authentication_subject_hash
        != authentication_subject_hash
    ):
        raise PersistenceConflictError(
            "The idempotency key belongs to another request."
        )
    if (
        application is not None
        and request_fingerprint is not None
        and application.request_fingerprint is not None
        and application.request_fingerprint != request_fingerprint
    ):
        raise PersistenceConflictError(
            "The idempotency key was reused for a different payload."
        )
    return application


def _request_fingerprint(
    account: AccountFacts,
    registration: RegistrationInput,
    subject_hash: str | None,
) -> str:
    payload = {
        "subject": subject_hash,
        "email": normalize_email(account.email),
        "registration": registration.model_dump(mode="json"),
    }
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _idempotency_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _find_existing_member(
    session: Session,
    normalized_email: str,
    normalized_student_number: str,
) -> tuple[LibraryMember | None, bool]:
    by_email = session.scalar(
        select(LibraryMember).where(
            LibraryMember.normalized_email == normalized_email
        )
    )
    by_student_number = None
    if normalized_student_number:
        by_student_number = session.scalar(
            select(LibraryMember).where(
                LibraryMember.normalized_student_number
                == normalized_student_number
            )
        )

    if (
        by_email is not None
        and by_student_number is not None
        and by_email.id != by_student_number.id
    ):
        return None, True

    return by_email or by_student_number, False


def _registration_matches_member(
    member: LibraryMember,
    registration: RegistrationInput,
    normalized_email: str,
    normalized_student_number: str,
) -> bool:
    return (
        member.normalized_email == normalized_email
        and member.normalized_student_number
        == (normalized_student_number or None)
        and member.full_name.strip() == registration.full_name.strip()
        and member.academic_role == str(registration.academic_role)
        and member.faculty_code == str(registration.faculty)
        and (member.grade or "") == registration.grade
    )


def _replayed_result(
    session: Session,
    application: LibraryApplication,
    identity: VerifiedGoogleIdentity | None = None,
    settings: Settings | None = None,
) -> RegistrationPersistenceResult:
    eligibility = EligibilityResponse(
        status=EligibilityStatus(application.eligibility_status),
        reasons=[ReasonCode(value) for value in application.reason_codes],
        normalized_email=application.normalized_email,
        normalized_student_number=(
            application.normalized_student_number or ""
        ),
        requires_student_details=application.academic_role
        in {"undergraduate", "master"},
    )
    identity_linked = False
    if identity is not None and application.member_id is not None:
        identity_linked = (
            session.scalar(
                select(LibraryIdentity.id).where(
                    LibraryIdentity.google_sub == identity.google_sub,
                    LibraryIdentity.member_id == application.member_id,
                    LibraryIdentity.unlinked_at.is_(None),
                )
            )
            is not None
        )

    drive_access_status = "not_enqueued"
    drive_notification_status = "not_applicable"
    if settings is not None:
        (
            drive_access_status,
            drive_notification_status,
        ) = drive_access_status_for_application(
            session,
            application,
            DRIVE_TARGET_ALIAS,
        )

    return RegistrationPersistenceResult(
        eligibility=eligibility,
        persisted=True,
        replayed=True,
        application_id=application.id,
        member_id=application.member_id,
        identity_linked=identity_linked,
        drive_access_status=drive_access_status,
        drive_notification_status=drive_notification_status,
    )


def persist_registration(
    session: Session,
    account: AccountFacts,
    registration: RegistrationInput,
    idempotency_key: str,
    *,
    settings: Settings | None = None,
    identity: VerifiedGoogleIdentity | None = None,
    source: str = "phase5_local",
) -> RegistrationPersistenceResult:
    active_settings = settings or get_settings()
    subject_hash = identity.subject_hash if identity is not None else None
    request_fingerprint = _request_fingerprint(
        account,
        registration,
        subject_hash,
    )
    stored_idempotency_key = _idempotency_digest(idempotency_key)

    production_public_rpc = (
        active_settings.app_env.lower() == "production"
        and active_settings.service_surface == "public"
    )
    if production_public_rpc:
        if (
            active_settings.public_database_access_mode != "rpc_v1"
            or identity is None
            or source != "phase6_authenticated"
        ):
            raise PublicRegistrationRpcBoundaryError(
                "public_registration_rpc_unavailable"
            )
        base_eligibility = evaluate_eligibility(
            account,
            registration,
            ExistingRegistration.NONE,
        )
        if base_eligibility.status == EligibilityStatus.NOT_READY:
            return RegistrationPersistenceResult(
                eligibility=base_eligibility,
                persisted=False,
                replayed=False,
            )
        if any(
            reason in AUTHENTICATION_FAILURES
            for reason in base_eligibility.reasons
        ):
            return RegistrationPersistenceResult(
                eligibility=base_eligibility,
                persisted=False,
                replayed=False,
            )
        try:
            rpc_result = persist_public_registration_v1(
                session,
                registration=registration,
                identity=identity,
                base_eligibility=base_eligibility,
                idempotency_digest=stored_idempotency_key,
                request_fingerprint=request_fingerprint,
                settings=active_settings,
            )
        except PublicRegistrationRpcConflictError as error:
            raise PersistenceConflictError(
                "A conflicting registration already exists."
            ) from error
        return RegistrationPersistenceResult(
            eligibility=rpc_result.eligibility,
            persisted=rpc_result.persisted,
            replayed=rpc_result.replayed,
            application_id=rpc_result.application_id,
            member_id=None,
            identity_linked=rpc_result.identity_linked,
            drive_access_status=rpc_result.drive_access_status,
            drive_notification_status=(
                rpc_result.drive_notification_status
            ),
        )

    existing_application = _find_application(
        session,
        stored_idempotency_key,
        subject_hash,
        request_fingerprint,
    )
    if existing_application is not None:
        return _replayed_result(
            session,
            existing_application,
            identity,
            active_settings,
        )

    normalized_email = normalize_email(account.email)
    normalized_student_number = normalize_student_number(
        registration.student_number
    )
    existing_member, identity_conflict = _find_existing_member(
        session,
        normalized_email,
        normalized_student_number,
    )

    linked_identity = None
    identity_binding_conflict = False
    if identity is not None:
        linked_identity = session.scalar(
            select(LibraryIdentity).where(
                LibraryIdentity.google_sub == identity.google_sub
            )
        )
        if linked_identity is not None:
            linked_member = session.get(
                LibraryMember,
                linked_identity.member_id,
            )
            if linked_identity.unlinked_at is not None:
                identity_binding_conflict = True
            elif linked_member is None:
                identity_binding_conflict = True
            elif (
                existing_member is not None
                and existing_member.id != linked_member.id
            ):
                identity_binding_conflict = True
                existing_member = linked_member
            else:
                existing_member = linked_member
        elif existing_member is not None:
            other_active_identity = session.scalar(
                select(LibraryIdentity.id).where(
                    LibraryIdentity.member_id == existing_member.id,
                    LibraryIdentity.unlinked_at.is_(None),
                )
            )
            if other_active_identity is not None:
                identity_binding_conflict = True

    identity_conflict = identity_conflict or identity_binding_conflict

    member_matches = (
        existing_member is not None
        and _registration_matches_member(
            existing_member,
            registration,
            normalized_email,
            normalized_student_number,
        )
    )
    if identity_conflict:
        existing_registration = ExistingRegistration.CONFLICT
    elif existing_member is None:
        existing_registration = ExistingRegistration.NONE
    elif member_matches:
        existing_registration = ExistingRegistration.MATCHING
    else:
        existing_registration = ExistingRegistration.CONFLICT

    eligibility = evaluate_eligibility(
        account,
        registration,
        existing_registration,
    )

    if eligibility.status == EligibilityStatus.NOT_READY:
        return RegistrationPersistenceResult(
            eligibility=eligibility,
            persisted=False,
            replayed=False,
        )
    if any(reason in AUTHENTICATION_FAILURES for reason in eligibility.reasons):
        return RegistrationPersistenceResult(
            eligibility=eligibility,
            persisted=False,
            replayed=False,
        )

    now = datetime.now(UTC)
    member = existing_member
    if (
        member is None
        and not identity_conflict
        and eligibility.status
        in {EligibilityStatus.APPROVED, EligibilityStatus.MANUAL_REVIEW}
    ):
        member = LibraryMember(
            id=uuid4(),
            normalized_email=normalized_email,
            normalized_student_number=normalized_student_number or None,
            full_name=registration.full_name.strip(),
            academic_role=str(registration.academic_role),
            faculty_code=str(registration.faculty),
            grade=registration.grade or None,
            registered_at=now,
            member_status=(
                "active"
                if eligibility.status == EligibilityStatus.APPROVED
                else "pending_review"
            ),
        )
        session.add(member)

    retention_until = None
    if eligibility.status == EligibilityStatus.INELIGIBLE:
        retention_until = now + timedelta(days=90)

    application = LibraryApplication(
        id=uuid4(),
        member_id=member.id if member else None,
        idempotency_key=stored_idempotency_key,
        authentication_subject_hash=subject_hash,
        request_fingerprint=request_fingerprint,
        normalized_email=normalized_email,
        normalized_student_number=normalized_student_number or None,
        full_name=registration.full_name.strip(),
        academic_role=str(registration.academic_role),
        faculty_code=str(registration.faculty),
        grade=registration.grade or None,
        question=registration.question.strip() or None,
        eligibility_status=str(eligibility.status),
        reason_codes=[str(reason) for reason in eligibility.reasons],
        terms_version=(
            active_settings.terms_version if registration.terms_accepted else None
        ),
        terms_accepted_at=now if registration.terms_accepted else None,
        privacy_version=(
            active_settings.privacy_version if registration.privacy_accepted else None
        ),
        privacy_accepted_at=now if registration.privacy_accepted else None,
        source=source,
        retention_until=retention_until,
        admin_decision=(
            "pending"
            if eligibility.status == EligibilityStatus.MANUAL_REVIEW
            else "not_required"
        ),
    )
    session.add(application)

    identity_linked = False
    may_link_new_identity = (
        identity is not None
        and member is not None
        and not identity_binding_conflict
        and (
            existing_member is None
            or member_matches
        )
    )
    if (
        identity is not None
        and linked_identity is not None
        and member is not None
    ):
        if (
            linked_identity.unlinked_at is None
            and linked_identity.member_id == member.id
        ):
            linked_identity.verified_email = identity.email
            linked_identity.hosted_domain = identity.hosted_domain
            linked_identity.email_verified = identity.email_verified
            linked_identity.issuer = identity.issuer
            linked_identity.audience = identity.audience
            linked_identity.last_verified_at = now
            identity_linked = True
    elif may_link_new_identity:
        session.add(
            LibraryIdentity(
                member_id=member.id,
                google_sub=identity.google_sub,
                verified_email=identity.email,
                hosted_domain=identity.hosted_domain,
                email_verified=identity.email_verified,
                issuer=identity.issuer,
                audience=identity.audience,
                last_verified_at=now,
            )
        )
        identity_linked = True

    drive_access_status = "not_enqueued"
    drive_notification_status = "not_applicable"
    if (
        member is not None
        and eligibility.status == EligibilityStatus.APPROVED
    ):
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
        drive_access_status = grant.status
        drive_notification_status = grant.notification_status
        operation_key = f"drive_grant:{member.id}:{DRIVE_TARGET_ALIAS}"
        existing_operation = session.scalar(
            select(LibraryOperation.id).where(
                LibraryOperation.operation_key == operation_key
            )
        )
        if existing_operation is None:
            operation = LibraryOperation(
                id=uuid4(),
                member_id=member.id,
                application_id=application.id,
                operation_key=operation_key,
                operation_type="drive_grant",
                # Deprecated compatibility field: never contains the actual
                # Drive ID for newly produced operations.
                resource_id=None,
                target_alias=DRIVE_TARGET_ALIAS,
                status="pending",
                max_attempts=3,
            )
            if identity_linked:
                session.flush()
                issue_drive_operation_attestation(
                    operation,
                    facts=build_drive_operation_attestation_facts(
                        session,
                        operation,
                        member,
                        grant,
                        application,
                    ),
                    key=active_settings.drive_operation_attestation_key,
                )
            session.add(operation)

    if eligibility.status == EligibilityStatus.MANUAL_REVIEW:
        session.flush()
        enqueue_manual_review_notification(session, application)

    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        replay = _find_application(
            session,
            stored_idempotency_key,
            subject_hash,
            request_fingerprint,
        )
        if replay is not None:
            return _replayed_result(
                session,
                replay,
                identity,
                active_settings,
            )
        raise PersistenceConflictError(
            "A conflicting registration already exists."
        ) from error

    return RegistrationPersistenceResult(
        eligibility=eligibility,
        persisted=True,
        replayed=False,
        application_id=application.id,
        member_id=member.id if member else None,
        identity_linked=identity_linked,
        drive_access_status=drive_access_status,
        drive_notification_status=drive_notification_status,
    )
