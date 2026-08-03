from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import hmac
import json
import re
import secrets
from typing import Final

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import VerifiedGoogleIdentity
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryIdentity,
    LibraryMember,
    LibraryOperation,
)
from app.eligibility import (
    evaluate_eligibility,
    normalize_email,
    normalize_student_number,
)
from app.schemas import (
    AccountFacts,
    EligibilityResponse,
    EligibilityStatus,
    RegistrationInput,
)


DRIVE_TARGET_ALIAS: Final[str] = "future-strategy-library-primary-v1"
DRIVE_OPERATION_ATTESTATION_VERSION: Final[str] = "v1"
_HEX_64 = re.compile(r"[0-9a-f]{64}")


class DriveOperationAttestationError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class DriveOperationAttestationFacts:
    member_email: str
    grant_role: str
    identity_google_sub: str | None = None
    identity_hosted_domain: str | None = None
    identity_issuer: str | None = None
    identity_audience: str | None = None
    application_authentication_subject_hash: str | None = None
    application_eligibility_status: str | None = None
    application_admin_decision: str | None = None
    application_academic_role: str | None = None
    application_faculty_code: str | None = None
    application_grade: str | None = None
    application_student_number: str | None = None
    application_reason_codes: tuple[str, ...] = ()
    terms_version: str | None = None
    terms_accepted_at: int | None = None
    privacy_version: str | None = None
    privacy_accepted_at: int | None = None


_ALLOWED_HOSTED_DOMAIN = "st.kitasato-u.ac.jp"
_VALID_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_MANUALLY_APPROVABLE_REASONS = {
    "role_requires_manual_review",
    "non_student_email_requires_manual_review",
}


def _epoch(value: datetime | None) -> int | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=UTC)
    return int(value.astimezone(UTC).timestamp())


def build_drive_operation_attestation_facts(
    session: Session,
    operation: LibraryOperation,
    member: LibraryMember,
    grant: LibraryAccessGrant,
    application: LibraryApplication | None = None,
) -> DriveOperationAttestationFacts:
    email = member.normalized_email
    if (
        email is None
        or email.strip().lower() != email
        or grant.member_id != member.id
        or grant.target_alias != DRIVE_TARGET_ALIAS
        or grant.role != "reader"
    ):
        raise DriveOperationAttestationError("operation_state_invalid")

    if operation.operation_type == "drive_revoke":
        if operation.application_id is not None:
            raise DriveOperationAttestationError("operation_state_invalid")
        return DriveOperationAttestationFacts(email, grant.role)

    if operation.operation_type != "drive_grant" or application is None:
        raise DriveOperationAttestationError("operation_state_invalid")
    if (
        member.member_status != "active"
        or operation.application_id != application.id
        or application.member_id != member.id
        or application.normalized_email != email
        or member.normalized_student_number
        != application.normalized_student_number
        or member.academic_role != application.academic_role
        or member.faculty_code != application.faculty_code
        or member.grade != application.grade
    ):
        raise DriveOperationAttestationError("operation_state_invalid")

    identities = list(
        session.scalars(
            select(LibraryIdentity).where(
                LibraryIdentity.member_id == member.id,
                LibraryIdentity.unlinked_at.is_(None),
            )
        )
    )
    if len(identities) != 1:
        raise DriveOperationAttestationError("operation_state_invalid")
    identity = identities[0]
    authentication_subject_hash = hashlib.sha256(
        identity.google_sub.encode("utf-8")
    ).hexdigest()
    if (
        not identity.email_verified
        or identity.verified_email != email
        or identity.hosted_domain != _ALLOWED_HOSTED_DOMAIN
        or identity.issuer not in _VALID_GOOGLE_ISSUERS
        or not identity.audience
        or not identity.google_sub
        or application.authentication_subject_hash
        != authentication_subject_hash
    ):
        raise DriveOperationAttestationError("operation_state_invalid")

    privacy_accepted = bool(
        application.privacy_version and application.privacy_accepted_at
    )
    terms_accepted = bool(
        application.terms_version and application.terms_accepted_at
    )
    try:
        registration = RegistrationInput(
            full_name=application.full_name,
            academic_role=application.academic_role,
            faculty=application.faculty_code,
            grade=application.grade or "",
            student_number=application.normalized_student_number or "",
            terms_accepted=terms_accepted,
            privacy_accepted=privacy_accepted,
            question=application.question or "",
        )
    except ValueError as error:
        raise DriveOperationAttestationError(
            "operation_state_invalid"
        ) from error
    eligibility = evaluate_eligibility(
        AccountFacts(
            verified=True,
            token_valid=True,
            email_verified=identity.email_verified,
            email=identity.verified_email,
            hosted_domain=identity.hosted_domain,
            allowed_hosted_domains=[_ALLOWED_HOSTED_DOMAIN],
        ),
        registration,
    )
    stored_reasons = tuple(sorted(str(value) for value in application.reason_codes))
    evaluated_reasons = tuple(sorted(str(value) for value in eligibility.reasons))
    auto_approved = (
        application.eligibility_status == "approved"
        and application.admin_decision == "not_required"
        and eligibility.status == EligibilityStatus.APPROVED
        and stored_reasons == evaluated_reasons
    )
    manually_approved = (
        application.eligibility_status == "manual_review"
        and application.admin_decision == "approved"
        and eligibility.status == EligibilityStatus.MANUAL_REVIEW
        and bool(stored_reasons)
        and set(stored_reasons).issubset(_MANUALLY_APPROVABLE_REASONS)
        and stored_reasons == evaluated_reasons
    )
    if not privacy_accepted or not (auto_approved or manually_approved):
        raise DriveOperationAttestationError("operation_state_invalid")

    return DriveOperationAttestationFacts(
        member_email=email,
        grant_role=grant.role,
        identity_google_sub=identity.google_sub,
        identity_hosted_domain=identity.hosted_domain,
        identity_issuer=identity.issuer,
        identity_audience=identity.audience,
        application_authentication_subject_hash=(
            application.authentication_subject_hash
        ),
        application_eligibility_status=application.eligibility_status,
        application_admin_decision=application.admin_decision,
        application_academic_role=application.academic_role,
        application_faculty_code=application.faculty_code,
        application_grade=application.grade,
        application_student_number=application.normalized_student_number,
        application_reason_codes=stored_reasons,
        terms_version=application.terms_version,
        terms_accepted_at=_epoch(application.terms_accepted_at),
        privacy_version=application.privacy_version,
        privacy_accepted_at=_epoch(application.privacy_accepted_at),
    )


def build_authenticated_registration_attestation_facts(
    identity: VerifiedGoogleIdentity,
    registration: RegistrationInput,
    eligibility: EligibilityResponse,
    *,
    terms_version: str,
    privacy_version: str,
    occurred_at: datetime,
) -> DriveOperationAttestationFacts:
    """Build the same facts as the persisted-state verifier before insertion.

    The production public RPC cannot read raw rows with its invoker rights.
    New-operation authorization is therefore signed before the single atomic
    RPC call, while the worker still rebuilds and verifies these facts from
    persisted state before any Drive side effect.
    """

    evaluated = evaluate_eligibility(
        AccountFacts(
            verified=True,
            token_valid=True,
            email_verified=identity.email_verified,
            email=identity.email,
            hosted_domain=identity.hosted_domain,
            allowed_hosted_domains=[_ALLOWED_HOSTED_DOMAIN],
        ),
        registration,
    )
    if (
        eligibility.status != EligibilityStatus.APPROVED
        or evaluated.status != EligibilityStatus.APPROVED
        or tuple(sorted(str(value) for value in eligibility.reasons))
        != tuple(sorted(str(value) for value in evaluated.reasons))
        or not registration.privacy_accepted
        or not registration.terms_accepted
        or not identity.email_verified
        or identity.hosted_domain != _ALLOWED_HOSTED_DOMAIN
        or identity.issuer not in _VALID_GOOGLE_ISSUERS
        or not identity.google_sub
        or not identity.audience
    ):
        raise DriveOperationAttestationError("operation_state_invalid")

    normalized_email = normalize_email(identity.email)
    normalized_student_number = normalize_student_number(
        registration.student_number
    )
    accepted_at = _epoch(occurred_at)
    return DriveOperationAttestationFacts(
        member_email=normalized_email,
        grant_role="reader",
        identity_google_sub=identity.google_sub,
        identity_hosted_domain=identity.hosted_domain,
        identity_issuer=identity.issuer,
        identity_audience=identity.audience,
        application_authentication_subject_hash=identity.subject_hash,
        application_eligibility_status="approved",
        application_admin_decision="not_required",
        application_academic_role=str(registration.academic_role),
        application_faculty_code=str(registration.faculty),
        application_grade=registration.grade or None,
        application_student_number=normalized_student_number or None,
        application_reason_codes=tuple(
            sorted(str(value) for value in eligibility.reasons)
        ),
        terms_version=terms_version,
        terms_accepted_at=accepted_at,
        privacy_version=privacy_version,
        privacy_accepted_at=accepted_at,
    )


def _key_bytes(value: str) -> bytes:
    encoded = value.encode("utf-8")
    if len(encoded) < 32:
        raise ValueError(
            "Drive operation attestation key must contain at least 32 bytes."
        )
    return encoded


def validate_drive_operation_attestation_key(value: str) -> None:
    _key_bytes(value)


def _canonical_payload(
    operation: LibraryOperation,
    facts: DriveOperationAttestationFacts,
) -> bytes:
    payload = {
        "application_id": (
            str(operation.application_id)
            if operation.application_id is not None
            else None
        ),
        "email": facts.member_email,
        "identity_audience": facts.identity_audience,
        "identity_google_sub": facts.identity_google_sub,
        "identity_hosted_domain": facts.identity_hosted_domain,
        "identity_issuer": facts.identity_issuer,
        "issued_at": operation.attestation_issued_at,
        "member_id": str(operation.member_id),
        "nonce": operation.attestation_nonce,
        "operation_id": str(operation.id),
        "operation_key": operation.operation_key,
        "operation_type": operation.operation_type,
        "role": facts.grant_role,
        "application_academic_role": facts.application_academic_role,
        "application_admin_decision": facts.application_admin_decision,
        "application_authentication_subject_hash": (
            facts.application_authentication_subject_hash
        ),
        "application_eligibility_status": facts.application_eligibility_status,
        "application_faculty_code": facts.application_faculty_code,
        "application_grade": facts.application_grade,
        "application_reason_codes": facts.application_reason_codes,
        "application_student_number": facts.application_student_number,
        "privacy_accepted_at": facts.privacy_accepted_at,
        "privacy_version": facts.privacy_version,
        "target_alias": operation.target_alias,
        "terms_accepted_at": facts.terms_accepted_at,
        "terms_version": facts.terms_version,
        "version": operation.attestation_version,
    }
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def issue_drive_operation_attestation(
    operation: LibraryOperation,
    *,
    facts: DriveOperationAttestationFacts,
    key: str,
    now: datetime | None = None,
    nonce: str | None = None,
) -> None:
    key_bytes = _key_bytes(key)
    normalized_email = facts.member_email.strip().lower()
    if not normalized_email or normalized_email != facts.member_email:
        raise ValueError("Drive operation email must already be normalized.")
    if operation.operation_type not in {"drive_grant", "drive_revoke"}:
        raise ValueError("Unsupported Drive operation type.")
    if facts.grant_role != "reader":
        raise ValueError("Drive operations may only attest the reader role.")
    if operation.target_alias != DRIVE_TARGET_ALIAS:
        raise ValueError("Drive operation target alias is invalid.")
    if operation.id is None:
        raise ValueError("Drive operation ID is required before attestation.")

    issued_at = now or datetime.now(UTC)
    if issued_at.tzinfo is None or issued_at.utcoffset() is None:
        issued_at = issued_at.replace(tzinfo=UTC)
    else:
        issued_at = issued_at.astimezone(UTC)
    active_nonce = nonce or secrets.token_hex(32)
    if _HEX_64.fullmatch(active_nonce) is None:
        raise ValueError("Drive operation attestation nonce is invalid.")

    operation.attestation_version = DRIVE_OPERATION_ATTESTATION_VERSION
    operation.attestation_issued_at = int(issued_at.timestamp())
    operation.attestation_nonce = active_nonce
    operation.attestation_consumed_at = None
    operation.attestation_signature = hmac.new(
        key_bytes,
        _canonical_payload(operation, facts),
        hashlib.sha256,
    ).hexdigest()


def verify_drive_operation_attestation(
    operation: LibraryOperation,
    *,
    facts: DriveOperationAttestationFacts,
    key: str,
    ttl_seconds: int,
    now: datetime | None = None,
    allow_consumed: bool = False,
) -> None:
    key_bytes = _key_bytes(key)
    if operation.attestation_consumed_at is not None and not allow_consumed:
        raise DriveOperationAttestationError("operation_attestation_replayed")
    if any(
        value is None
        for value in (
            operation.attestation_version,
            operation.attestation_issued_at,
            operation.attestation_nonce,
            operation.attestation_signature,
        )
    ):
        raise DriveOperationAttestationError("operation_attestation_missing")
    if (
        operation.attestation_version
        != DRIVE_OPERATION_ATTESTATION_VERSION
        or operation.target_alias != DRIVE_TARGET_ALIAS
        or operation.operation_type not in {"drive_grant", "drive_revoke"}
        or facts.grant_role != "reader"
        or facts.member_email.strip().lower() != facts.member_email
        or _HEX_64.fullmatch(operation.attestation_nonce or "") is None
        or _HEX_64.fullmatch(operation.attestation_signature or "") is None
    ):
        raise DriveOperationAttestationError("operation_attestation_invalid")

    checked_at = now or datetime.now(UTC)
    if checked_at.tzinfo is None or checked_at.utcoffset() is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    else:
        checked_at = checked_at.astimezone(UTC)
    age_seconds = int(checked_at.timestamp()) - int(
        operation.attestation_issued_at
    )
    if age_seconds < -60 or age_seconds > ttl_seconds:
        raise DriveOperationAttestationError("operation_attestation_expired")

    expected_signature = hmac.new(
        key_bytes,
        _canonical_payload(operation, facts),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(
        expected_signature,
        operation.attestation_signature,
    ):
        raise DriveOperationAttestationError("operation_attestation_invalid")
