from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import LibraryOperation
from app.drive_attestation import (
    DRIVE_TARGET_ALIAS,
    build_authenticated_registration_attestation_facts,
    issue_drive_operation_attestation,
)
from app.eligibility import normalize_email, normalize_student_number
from app.schemas import (
    EligibilityResponse,
    EligibilityStatus,
    ReasonCode,
    RegistrationInput,
)


SUBMIT_REGISTRATION_V1_SQL = text(
    "SELECT * FROM fsl_public_api.submit_registration_v1("
    "CAST(:request AS jsonb), :rpc_token)"
)
REGISTRATION_STATUS_V1_SQL = text(
    "SELECT * FROM fsl_public_api.registration_status_v1("
    ":application_id, :authentication_subject_hash, "
    ":rpc_key_version, :rpc_token)"
)


class PublicRegistrationRpcBoundaryError(RuntimeError):
    """The production public database capability boundary is unavailable."""


class PublicRegistrationRpcConflictError(RuntimeError):
    """A bounded registration request conflicts with persisted state."""


@dataclass(frozen=True)
class PublicRegistrationRpcResult:
    eligibility: EligibilityResponse
    persisted: bool
    replayed: bool
    application_id: UUID | None
    identity_linked: bool
    drive_access_status: str
    drive_notification_status: str


@dataclass(frozen=True)
class PublicRegistrationStatusResult:
    application_id: UUID
    drive_access_status: str
    drive_notification_status: str


def _sqlstate(error: DBAPIError) -> str | None:
    return getattr(error.orig, "sqlstate", None)


def _reason_values(value: object) -> list[str]:
    if isinstance(value, str):
        parsed = json.loads(value)
    else:
        parsed = value
    if not isinstance(parsed, list) or not all(
        isinstance(item, str) for item in parsed
    ):
        raise PublicRegistrationRpcBoundaryError(
            "public_registration_rpc_invalid_response"
        )
    return parsed


def _map_submit_row(
    row: object,
    *,
    normalized_email: str,
    normalized_student_number: str,
    requires_student_details: bool,
) -> PublicRegistrationRpcResult:
    try:
        values = row if isinstance(row, dict) else dict(row)
        eligibility = EligibilityResponse(
            status=EligibilityStatus(values["eligibility_status"]),
            reasons=[
                ReasonCode(value)
                for value in _reason_values(values["reason_codes"])
            ],
            normalized_email=normalized_email,
            normalized_student_number=normalized_student_number,
            requires_student_details=requires_student_details,
        )
        application_id = values["application_id"]
        if application_id is not None and not isinstance(application_id, UUID):
            application_id = UUID(str(application_id))
        return PublicRegistrationRpcResult(
            eligibility=eligibility,
            persisted=values["persisted"] is True,
            replayed=values["replayed"] is True,
            application_id=application_id,
            identity_linked=values["identity_linked"] is True,
            drive_access_status=str(values["drive_access_status"]),
            drive_notification_status=str(
                values["drive_notification_status"]
            ),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise PublicRegistrationRpcBoundaryError(
            "public_registration_rpc_invalid_response"
        ) from error


def _execute_submit(
    session: Session,
    payload: dict[str, object],
    *,
    rpc_token: str,
):
    return session.execute(
        SUBMIT_REGISTRATION_V1_SQL,
        {
            "request": json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            "rpc_token": rpc_token,
        },
    ).mappings().one()


def persist_public_registration_v1(
    session: Session,
    *,
    registration: RegistrationInput,
    identity: VerifiedGoogleIdentity,
    base_eligibility: EligibilityResponse,
    idempotency_digest: str,
    request_fingerprint: str,
    settings: Settings,
) -> PublicRegistrationRpcResult:
    occurred_at = datetime.now(UTC).replace(microsecond=0)
    occurred_at_epoch = int(occurred_at.timestamp())
    member_id = uuid4()
    application_id = uuid4()
    operation = LibraryOperation(
        id=uuid4(),
        member_id=member_id,
        application_id=application_id,
        operation_key=f"drive_grant:{member_id}:{DRIVE_TARGET_ALIAS}",
        operation_type="drive_grant",
        resource_id=None,
        target_alias=DRIVE_TARGET_ALIAS,
        status="pending",
        max_attempts=3,
    )

    if base_eligibility.status == EligibilityStatus.APPROVED:
        facts = build_authenticated_registration_attestation_facts(
            identity,
            registration,
            base_eligibility,
            terms_version=settings.terms_version,
            privacy_version=settings.privacy_version,
            occurred_at=occurred_at,
        )
        issue_drive_operation_attestation(
            operation,
            facts=facts,
            key=settings.drive_operation_attestation_key,
            now=occurred_at,
        )

    normalized_email = normalize_email(identity.email)
    normalized_student_number = normalize_student_number(
        registration.student_number
    )
    payload: dict[str, object] = {
        "contract_version": "v1",
        "rpc_key_version": settings.public_registration_rpc_key_version,
        "idempotency_digest": idempotency_digest,
        "request_fingerprint": request_fingerprint,
        "authentication_subject_hash": identity.subject_hash,
        "normalized_email": normalized_email,
        "normalized_student_number": normalized_student_number,
        "full_name": registration.full_name.strip(),
        "academic_role": str(registration.academic_role),
        "faculty_code": str(registration.faculty),
        "grade": registration.grade,
        "question": registration.question,
        "base_eligibility_status": str(base_eligibility.status),
        "base_reason_codes": [
            str(reason) for reason in base_eligibility.reasons
        ],
        "requires_student_details": (
            base_eligibility.requires_student_details
        ),
        "terms_version": (
            settings.terms_version if registration.terms_accepted else None
        ),
        "terms_accepted": registration.terms_accepted,
        "privacy_version": (
            settings.privacy_version if registration.privacy_accepted else None
        ),
        "privacy_accepted": registration.privacy_accepted,
        "google_sub": identity.google_sub,
        "identity_email": normalized_email,
        "hosted_domain": identity.hosted_domain,
        "email_verified": identity.email_verified,
        "issuer": identity.issuer,
        "audience": identity.audience,
        "occurred_at_epoch": occurred_at_epoch,
        "candidate_member_id": str(member_id),
        "candidate_identity_id": str(uuid4()),
        "candidate_application_id": str(application_id),
        "candidate_grant_id": str(uuid4()),
        "candidate_operation_id": str(operation.id),
        "attestation_version": operation.attestation_version,
        "attestation_issued_at": operation.attestation_issued_at,
        "attestation_nonce": operation.attestation_nonce,
        "attestation_signature": operation.attestation_signature,
    }

    try:
        row = _execute_submit(
            session,
            payload,
            rpc_token=settings.public_registration_rpc_token,
        )
    except IntegrityError as error:
        session.rollback()
        # A concurrent unique insert can win after the advisory-lock lookup.
        # Re-running the same bounded request resolves to replay or a generic
        # conflict without exposing which PII field collided.
        if _sqlstate(error) != "23505":
            raise PublicRegistrationRpcConflictError(
                "registration_conflict"
            ) from error
        try:
            row = _execute_submit(
                session,
                payload,
                rpc_token=settings.public_registration_rpc_token,
            )
        except DBAPIError as retry_error:
            session.rollback()
            if _sqlstate(retry_error) in {"23505", "P0001"}:
                raise PublicRegistrationRpcConflictError(
                    "registration_conflict"
                ) from retry_error
            raise PublicRegistrationRpcBoundaryError(
                "public_registration_rpc_unavailable"
            ) from retry_error
    except DBAPIError as error:
        session.rollback()
        if _sqlstate(error) == "P0001":
            raise PublicRegistrationRpcConflictError(
                "registration_conflict"
            ) from error
        raise PublicRegistrationRpcBoundaryError(
            "public_registration_rpc_unavailable"
        ) from error

    # Validate the bounded function response while the transaction can still be
    # rolled back. A malformed/expanded contract must never be committed and
    # then reported as a failed registration.
    try:
        mapped = _map_submit_row(
            row,
            normalized_email=normalized_email,
            normalized_student_number=normalized_student_number,
            requires_student_details=(
                base_eligibility.requires_student_details
            ),
        )
        session.commit()
    except PublicRegistrationRpcBoundaryError:
        session.rollback()
        raise
    except Exception as error:
        session.rollback()
        raise PublicRegistrationRpcBoundaryError(
            "public_registration_rpc_unavailable"
        ) from error

    return mapped


def fetch_public_registration_status_v1(
    session: Session,
    *,
    application_id: UUID,
    authentication_subject_hash: str,
    settings: Settings,
) -> PublicRegistrationStatusResult | None:
    try:
        row = session.execute(
            REGISTRATION_STATUS_V1_SQL,
            {
                "application_id": application_id,
                "authentication_subject_hash": authentication_subject_hash,
                "rpc_key_version": (
                    settings.public_registration_rpc_key_version
                ),
                "rpc_token": settings.public_registration_rpc_token,
            },
        ).mappings().one_or_none()
    except DBAPIError as error:
        session.rollback()
        raise PublicRegistrationRpcBoundaryError(
            "public_registration_rpc_unavailable"
        ) from error
    if row is None:
        return None
    try:
        result_application_id = row["application_id"]
        if not isinstance(result_application_id, UUID):
            result_application_id = UUID(str(result_application_id))
        return PublicRegistrationStatusResult(
            application_id=result_application_id,
            drive_access_status=str(row["drive_access_status"]),
            drive_notification_status=str(
                row["drive_notification_status"]
            ),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise PublicRegistrationRpcBoundaryError(
            "public_registration_rpc_invalid_response"
        ) from error
