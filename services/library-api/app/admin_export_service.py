from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import json
from threading import Lock
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin_service import AdminPrincipal
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryAdminAudit,
    LibraryExportRun,
    LibraryMember,
)
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.member_export import (
    ExportArtifact,
    MEMBER_EXPORT_SCHEMA_VERSION,
    MemberExportRow,
    build_member_export,
)
from app.roster import roster_grade_label, roster_grade_rank_expression
from app.schemas import AdminExportRequest


class AdminExportError(RuntimeError):
    pass


class AdminExportConflictError(AdminExportError):
    pass


class AdminExportBusyError(AdminExportError):
    pass


class AdminExportLimitError(AdminExportError):
    pass


@dataclass(frozen=True, slots=True)
class GeneratedAdminExport:
    export_run_id: UUID
    artifact: ExportArtifact
    recommended_delete_at: datetime


# The initial Cloud Run plan has max-instance=1. Keeping generation in memory
# and allowing one export at a time bounds both RAM and accidental double-click
# amplification. Database uniqueness remains the cross-request safety boundary.
_EXPORT_LOCK = Lock()


def _audit_reason(request: AdminExportRequest) -> str:
    """Return a server-owned, non-PII audit value for the allowlisted purpose."""

    return f"export_purpose:{request.purpose_code.value}"


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _request_identity(
    principal: AdminPrincipal,
    request: AdminExportRequest,
) -> tuple[str, str, dict[str, str]]:
    filters = {"member_status": request.member_status}
    if request.academic_role is not None:
        filters["academic_role"] = request.academic_role
    payload = {
        "actor_admin_id": str(principal.admin_id),
        "format": request.format,
        "filters": filters,
        "purpose_code": request.purpose_code.value,
        "schema_version": MEMBER_EXPORT_SCHEMA_VERSION,
    }
    fingerprint = hashlib.sha256(_canonical_json(payload)).hexdigest()
    return fingerprint, request.format, filters


def _action_key(principal: AdminPrincipal, idempotency_key: str) -> str:
    return hashlib.sha256(
        (
            f"phase10a-member-export:{principal.admin_id}:"
            f"{idempotency_key}"
        ).encode("utf-8")
    ).hexdigest()


def _find_existing_run(
    session: Session,
    action_key: str,
    request_fingerprint: str,
) -> None:
    existing = session.scalar(
        select(LibraryExportRun).where(
            LibraryExportRun.action_key == action_key
        )
    )
    if existing is None:
        return
    if existing.request_fingerprint != request_fingerprint:
        raise AdminExportConflictError("idempotency_payload_mismatch")
    # Export bytes are intentionally not persisted. A replay therefore cannot
    # safely reconstruct the exact already-audited snapshot.
    if existing.status == "failed":
        raise AdminExportConflictError("export_request_already_failed")
    raise AdminExportConflictError("export_already_generated")


def _as_utc(value: datetime) -> datetime:
    # SQLite drops timezone information in local tests. Database timestamps are
    # defined as UTC; PostgreSQL returns aware values in deployed environments.
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _snapshot_rows(
    session: Session,
    settings: Settings,
    request: AdminExportRequest,
) -> list[MemberExportRow]:
    statement = (
        select(LibraryMember, LibraryAccessGrant)
        .outerjoin(
            LibraryAccessGrant,
            and_(
                LibraryAccessGrant.member_id == LibraryMember.id,
                LibraryAccessGrant.target_alias == DRIVE_TARGET_ALIAS,
            ),
        )
        .order_by(
            roster_grade_rank_expression(),
            LibraryMember.normalized_student_number.asc().nulls_last(),
            LibraryMember.registered_at.asc().nulls_last(),
            LibraryMember.id,
        )
        .limit(settings.phase10a_export_max_rows + 1)
    )
    if request.member_status != "all":
        statement = statement.where(
            LibraryMember.member_status == request.member_status
        )
    if request.academic_role is not None:
        statement = statement.where(
            LibraryMember.academic_role == request.academic_role
        )

    selected = list(session.execute(statement).all())
    if len(selected) > settings.phase10a_export_max_rows:
        raise AdminExportLimitError("export_row_limit_exceeded")
    return [
        MemberExportRow(
            member_id=member.id,
            record_version=member.record_version,
            full_name=member.full_name,
            university_email=member.normalized_email,
            student_number=member.normalized_student_number,
            academic_role=member.academic_role,
            faculty_code=member.faculty_code,
            grade=member.grade,
            roster_grade=roster_grade_label(
                member.academic_role,
                member.grade,
            ),
            member_status=member.member_status,
            drive_access_status=(grant.status if grant else "not_enqueued"),
            drive_permission_managed=(grant.managed_by_system if grant else False),
            created_at_utc=_as_utc(member.created_at),
            registered_at_utc=(
                _as_utc(member.registered_at)
                if member.registered_at is not None
                else None
            ),
            updated_at_utc=_as_utc(member.updated_at),
            deactivated_at_utc=(
                _as_utc(member.deactivated_at)
                if member.deactivated_at is not None
                else None
            ),
        )
        for member, grant in selected
    ]


def _record_export(
    session: Session,
    principal: AdminPrincipal,
    request: AdminExportRequest,
    *,
    action_key: str,
    request_fingerprint: str,
    request_id: str,
    snapshot_at: datetime,
    recommended_delete_at: datetime,
    artifact: ExportArtifact,
) -> LibraryExportRun:
    manifest = artifact.manifest
    run = LibraryExportRun(
        admin_id=principal.admin_id,
        schema_version=manifest.schema_version,
        export_format=request.format,
        status="generated",
        request_id=request_id,
        action_key=action_key,
        request_fingerprint=request_fingerprint,
        row_count=manifest.row_count,
        byte_count=manifest.byte_count,
        content_hash=manifest.sha256,
        filters_json=dict(manifest.filters),
        snapshot_at=snapshot_at,
        completed_at=datetime.now(UTC),
        recommended_delete_at=recommended_delete_at,
        failure_code=None,
    )
    session.add(run)
    session.flush()
    session.add(
        LibraryAdminAudit(
            admin_id=principal.admin_id,
            action="member_export_generated",
            action_key=hashlib.sha256(
                f"{action_key}:audit".encode("utf-8")
            ).hexdigest(),
            actor_role=principal.role,
            result="accepted",
            request_id=request_id,
            reason=_audit_reason(request),
            metadata_json={
                "request_fingerprint": request_fingerprint,
                "export_run_id": str(run.id),
                "schema_version": manifest.schema_version,
                "export_format": request.format,
                "purpose_code": request.purpose_code.value,
                "row_count": manifest.row_count,
                "byte_count": manifest.byte_count,
                "content_sha256": manifest.sha256,
                "filters": dict(manifest.filters),
                "recommended_delete_at": recommended_delete_at.isoformat(),
            },
        )
    )
    session.commit()
    return run


def _record_failed_export(
    session: Session,
    principal: AdminPrincipal,
    request: AdminExportRequest,
    *,
    action_key: str,
    request_fingerprint: str,
    request_id: str,
    snapshot_at: datetime,
    recommended_delete_at: datetime,
    filters: dict[str, str],
    failure_code: str,
) -> None:
    run = LibraryExportRun(
        admin_id=principal.admin_id,
        schema_version=MEMBER_EXPORT_SCHEMA_VERSION,
        export_format=request.format,
        status="failed",
        request_id=request_id,
        action_key=action_key,
        request_fingerprint=request_fingerprint,
        row_count=0,
        byte_count=0,
        content_hash=None,
        filters_json=filters,
        snapshot_at=snapshot_at,
        completed_at=datetime.now(UTC),
        recommended_delete_at=recommended_delete_at,
        failure_code=failure_code,
    )
    session.add(run)
    session.flush()
    session.add(
        LibraryAdminAudit(
            admin_id=principal.admin_id,
            action="member_export_failed",
            action_key=hashlib.sha256(
                f"{action_key}:audit".encode("utf-8")
            ).hexdigest(),
            actor_role=principal.role,
            result="rejected",
            request_id=request_id,
            reason=_audit_reason(request),
            metadata_json={
                "request_fingerprint": request_fingerprint,
                "export_run_id": str(run.id),
                "schema_version": MEMBER_EXPORT_SCHEMA_VERSION,
                "export_format": request.format,
                "purpose_code": request.purpose_code.value,
                "filters": filters,
                "failure_code": failure_code,
            },
        )
    )
    session.commit()


def generate_admin_member_export(
    session: Session,
    settings: Settings,
    principal: AdminPrincipal,
    request: AdminExportRequest,
    *,
    idempotency_key: str,
    request_id: str,
) -> GeneratedAdminExport:
    if principal.role != "admin":
        raise AdminExportError("admin_access_denied")
    if not settings.phase10a_export_api_enabled:
        raise AdminExportError("phase10a_export_disabled")
    if settings.api_read_only_mode:
        raise AdminExportError("api_read_only")
    if not _EXPORT_LOCK.acquire(blocking=False):
        raise AdminExportBusyError("export_generation_busy")

    try:
        request_fingerprint, _format, filters = _request_identity(
            principal,
            request,
        )
        action_key = _action_key(principal, idempotency_key)
        _find_existing_run(session, action_key, request_fingerprint)
        snapshot_at = datetime.now(UTC)
        recommended_delete_at = snapshot_at + timedelta(
            days=settings.phase10a_download_retention_days
        )
        try:
            rows = _snapshot_rows(session, settings, request)
            artifact = build_member_export(
                rows,
                export_format=request.format,
                snapshot_at_utc=snapshot_at,
                filters=filters,
            )
        except AdminExportLimitError as failure:
            _record_failed_export(
                session,
                principal,
                request,
                action_key=action_key,
                request_fingerprint=request_fingerprint,
                request_id=request_id,
                snapshot_at=snapshot_at,
                recommended_delete_at=recommended_delete_at,
                filters=filters,
                failure_code=str(failure),
            )
            raise
        except ValueError as error:
            if str(error) in {
                "export_row_limit_exceeded",
                "export_byte_limit_exceeded",
            }:
                failure = AdminExportLimitError(str(error))
            else:
                failure = AdminExportError("export_generation_failed")
            _record_failed_export(
                session,
                principal,
                request,
                action_key=action_key,
                request_fingerprint=request_fingerprint,
                request_id=request_id,
                snapshot_at=snapshot_at,
                recommended_delete_at=recommended_delete_at,
                filters=filters,
                failure_code=str(failure),
            )
            raise failure from error
        if artifact.manifest.byte_count > settings.phase10a_export_max_bytes:
            failure = AdminExportLimitError("export_byte_limit_exceeded")
            _record_failed_export(
                session,
                principal,
                request,
                action_key=action_key,
                request_fingerprint=request_fingerprint,
                request_id=request_id,
                snapshot_at=snapshot_at,
                recommended_delete_at=recommended_delete_at,
                filters=filters,
                failure_code=str(failure),
            )
            raise failure
        try:
            run = _record_export(
                session,
                principal,
                request,
                action_key=action_key,
                request_fingerprint=request_fingerprint,
                request_id=request_id,
                snapshot_at=snapshot_at,
                recommended_delete_at=recommended_delete_at,
                artifact=artifact,
            )
        except IntegrityError as error:
            session.rollback()
            _find_existing_run(session, action_key, request_fingerprint)
            raise AdminExportConflictError("export_audit_conflict") from error
        return GeneratedAdminExport(
            export_run_id=run.id,
            artifact=artifact,
            recommended_delete_at=recommended_delete_at,
        )
    finally:
        _EXPORT_LOCK.release()
