from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    event,
    func,
    inspect as sqlalchemy_inspect,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class LibraryMember(TimestampMixin, Base):
    __tablename__ = "library_members"
    __table_args__ = (
        CheckConstraint(
            "member_status IN ('active', 'pending_review', 'inactive')",
            name="ck_library_members_status",
        ),
        CheckConstraint(
            "normalized_email = lower(normalized_email)",
            name="ck_library_members_email_normalized",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    normalized_email: Mapped[str | None] = mapped_column(
        String(320),
        unique=True,
        index=True,
        nullable=True,
    )
    normalized_student_number: Mapped[str | None] = mapped_column(
        String(16),
        unique=True,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    academic_role: Mapped[str] = mapped_column(String(32), nullable=False)
    faculty_code: Mapped[str] = mapped_column(String(32), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(16))
    registered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )
    member_status: Mapped[str] = mapped_column(
        String(32),
        default="pending_review",
        nullable=False,
    )
    record_version: Mapped[int] = mapped_column(
        BigInteger,
        default=1,
        nullable=False,
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    identities: Mapped[list[LibraryIdentity]] = relationship(
        back_populates="member",
        cascade="all, delete-orphan",
    )
    applications: Mapped[list[LibraryApplication]] = relationship(
        back_populates="member",
    )
    access_grants: Mapped[list[LibraryAccessGrant]] = relationship(
        back_populates="member",
        cascade="all, delete-orphan",
    )
    operations: Mapped[list[LibraryOperation]] = relationship(
        back_populates="member",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {"version_id_col": record_version}


class LibraryIdentity(Base):
    __tablename__ = "library_identities"
    __table_args__ = (
        CheckConstraint(
            "verified_email = lower(verified_email)",
            name="ck_library_identities_email_normalized",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    member_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    google_sub: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )
    verified_email: Mapped[str] = mapped_column(String(320), nullable=False)
    hosted_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    issuer: Mapped[str] = mapped_column(
        String(255),
        default="https://accounts.google.com",
        nullable=False,
    )
    audience: Mapped[str | None] = mapped_column(String(255))
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    unlinked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    last_verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    member: Mapped[LibraryMember] = relationship(back_populates="identities")


class LibraryApplication(Base):
    __tablename__ = "library_applications"
    __table_args__ = (
        CheckConstraint(
            (
                "eligibility_status IN "
                "('approved', 'manual_review', 'ineligible', "
                "'already_registered')"
            ),
            name="ck_library_applications_status",
        ),
        CheckConstraint(
            "normalized_email = lower(normalized_email)",
            name="ck_library_applications_email_normalized",
        ),
        CheckConstraint(
            "admin_decision IN ('not_required', 'pending', 'approved', 'rejected')",
            name="ck_library_applications_admin_decision",
        ),
        Index(
            "ix_library_applications_admin_queue",
            "admin_decision",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    member_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_members.id", ondelete="SET NULL"),
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        nullable=False,
    )
    authentication_subject_hash: Mapped[str | None] = mapped_column(
        String(64),
        index=True,
    )
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    normalized_email: Mapped[str] = mapped_column(
        String(320),
        index=True,
        nullable=False,
    )
    normalized_student_number: Mapped[str | None] = mapped_column(
        String(16),
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    academic_role: Mapped[str] = mapped_column(String(32), nullable=False)
    faculty_code: Mapped[str] = mapped_column(String(32), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(16))
    question: Mapped[str | None] = mapped_column(Text)
    eligibility_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    reason_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    terms_version: Mapped[str | None] = mapped_column(String(64))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    privacy_version: Mapped[str | None] = mapped_column(String(64))
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    source: Mapped[str] = mapped_column(
        String(32),
        default="phase5_local",
        nullable=False,
    )
    retention_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    admin_decision: Mapped[str] = mapped_column(
        String(32),
        default="not_required",
        nullable=False,
    )
    decision_reason: Mapped[str | None] = mapped_column(String(500))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by_admin_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_admins.id", ondelete="SET NULL"),
        index=True,
    )
    record_version: Mapped[int] = mapped_column(
        BigInteger,
        default=1,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    member: Mapped[LibraryMember | None] = relationship(
        back_populates="applications"
    )

    __mapper_args__ = {"version_id_col": record_version}


class LibraryAccessGrant(Base):
    __tablename__ = "library_access_grants"
    __table_args__ = (
        UniqueConstraint(
            "member_id",
            "resource_id",
            name="uq_library_access_grants_member_resource",
        ),
        UniqueConstraint(
            "member_id",
            "target_alias",
            name="uq_library_access_grants_member_target_alias",
        ),
        CheckConstraint(
            (
                "status IN "
                "('pending', 'granted', 'already_granted', 'failed', 'revoked')"
            ),
            name="ck_library_access_grants_status",
        ),
        CheckConstraint(
            (
                "notification_status IN "
                "('pending', 'sent_by_drive', 'not_applicable', 'failed')"
            ),
            name="ck_library_access_grants_notification_status",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    member_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # Public/admin producers know only this logical alias. The actual Drive
    # resource ID remains worker-only runtime configuration.
    target_alias: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )
    permission_id: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
    )
    role: Mapped[str] = mapped_column(
        String(32),
        default="reader",
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
    )
    managed_by_system: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    notification_status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
    )
    notification_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    granted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    member: Mapped[LibraryMember] = relationship(
        back_populates="access_grants"
    )


class LibraryOperation(Base):
    __tablename__ = "library_operations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed', 'dead')",
            name="ck_library_operations_status",
        ),
        Index(
            "ix_library_operations_due",
            "operation_type",
            "status",
            "next_attempt_at",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    member_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_applications.id", ondelete="SET NULL"),
        index=True,
    )
    operation_key: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )
    operation_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(255), index=True)
    target_alias: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )
    attestation_version: Mapped[str | None] = mapped_column(String(16))
    attestation_issued_at: Mapped[int | None] = mapped_column(BigInteger)
    attestation_nonce: Mapped[str | None] = mapped_column(
        String(64),
        unique=True,
    )
    attestation_signature: Mapped[str | None] = mapped_column(String(64))
    attestation_consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    max_attempts: Mapped[int] = mapped_column(
        Integer,
        default=3,
        nullable=False,
    )
    error_code: Mapped[str | None] = mapped_column(String(128))
    error_summary: Mapped[str | None] = mapped_column(String(500))
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    lease_owner: Mapped[str | None] = mapped_column(String(64))
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    external_action_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    record_version: Mapped[int] = mapped_column(
        BigInteger,
        default=1,
        nullable=False,
    )

    member: Mapped[LibraryMember] = relationship(back_populates="operations")

    __mapper_args__ = {"version_id_col": record_version}


class LibraryResourceLease(Base):
    __tablename__ = "library_resource_leases"

    resource_id: Mapped[str] = mapped_column(
        String(255),
        primary_key=True,
    )
    lease_owner: Mapped[str | None] = mapped_column(String(64))
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class LibraryAdmin(Base):
    __tablename__ = "library_admins"
    __table_args__ = (
        CheckConstraint(
            "role IN ('viewer', 'operator', 'admin')",
            name="ck_library_admins_role",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    google_sub: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


class LibraryAdminAudit(Base):
    __tablename__ = "library_admin_audit"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    admin_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_admins.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    action_key: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        nullable=False,
    )
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    member_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        index=True,
    )
    application_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        index=True,
    )
    operation_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        index=True,
    )
    reason: Mapped[str | None] = mapped_column(String(500))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class LibraryImportBatch(Base):
    __tablename__ = "library_import_batches"
    __table_args__ = (
        CheckConstraint(
            (
                "status IN ('staged', 'validated', 'approved', 'applied', "
                "'rolled_back', 'rejected')"
            ),
            name="ck_library_import_batches_status",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_hash: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        nullable=False,
    )
    schema_version: Mapped[str] = mapped_column(String(64), nullable=False)
    normalization_rule_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    fingerprint_key_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    target_drive_resource_fingerprint: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    reference_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    source_manifest_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    dry_run_report_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    dry_run_hash: Mapped[str | None] = mapped_column(String(64))
    staged_normalized_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    raw_snapshot_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    legal_hold: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    raw_purged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="staged",
        nullable=False,
    )
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    approved_by_admin_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_admins.id", ondelete="RESTRICT"),
        index=True,
    )
    approved_source_hash: Mapped[str | None] = mapped_column(String(128))
    approved_normalized_hash: Mapped[str | None] = mapped_column(String(64))
    approval_key: Mapped[str | None] = mapped_column(
        String(128),
        unique=True,
    )
    approval_reason: Mapped[str | None] = mapped_column(String(500))
    rolled_back_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    rolled_back_by_admin_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_admins.id", ondelete="RESTRICT"),
        index=True,
    )
    rollback_reason: Mapped[str | None] = mapped_column(String(500))
    rejected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    rejected_by_admin_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_admins.id", ondelete="RESTRICT"),
        index=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(500))
    record_version: Mapped[int] = mapped_column(
        BigInteger,
        default=1,
        nullable=False,
    )

    rows: Mapped[list[LibraryImportRow]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {"version_id_col": record_version}


class LibraryImportRow(Base):
    __tablename__ = "library_import_rows"
    __table_args__ = (
        UniqueConstraint(
            "batch_id",
            "source_system",
            "source_row_number",
            name="uq_library_import_rows_batch_row",
        ),
        UniqueConstraint(
            "batch_id",
            "source_row_fingerprint",
            name="uq_library_import_rows_batch_fingerprint",
        ),
        CheckConstraint(
            "source_row_number > 0",
            name="ck_library_import_rows_positive_row_number",
        ),
        CheckConstraint(
            "classification IN ('ready', 'manual_resolution', 'excluded')",
            name="ck_library_import_rows_classification",
        ),
        CheckConstraint(
            "apply_status IN ('pending', 'applied', 'skipped', 'rolled_back')",
            name="ck_library_import_rows_apply_status",
        ),
        CheckConstraint(
            (
                "consent_version_provenance IN "
                "('legacy_unknown', 'not_applicable')"
            ),
            name="ck_library_import_rows_consent_version_provenance",
        ),
        CheckConstraint(
            (
                "consent_timestamp_provenance IN "
                "('legacy_unknown', 'not_applicable')"
            ),
            name="ck_library_import_rows_consent_timestamp_provenance",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    batch_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_import_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_system: Mapped[str] = mapped_column(String(32), nullable=False)
    source_row_fingerprint: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    raw_payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    fingerprint_key_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    normalization_rule_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    classification: Mapped[str] = mapped_column(String(64), nullable=False)
    source_payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
    )
    normalized_payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
    )
    normalized_payload_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    legacy_terms_consent_recorded: Mapped[bool | None] = mapped_column(Boolean)
    legacy_privacy_consent_recorded: Mapped[bool | None] = mapped_column(Boolean)
    consent_version_provenance: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    consent_timestamp_provenance: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    error_codes: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    resolution_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    apply_status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
    )
    applied_member_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        index=True,
    )
    applied_access_grant_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        index=True,
    )
    member_created_by_batch: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    access_grant_created_by_batch: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    applied_member_snapshot_hash: Mapped[str | None] = mapped_column(String(64))
    applied_access_grant_snapshot_hash: Mapped[str | None] = mapped_column(
        String(64)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    batch: Mapped[LibraryImportBatch] = relationship(back_populates="rows")


@event.listens_for(LibraryImportRow.source_payload, "set", retval=True)
def _keep_import_source_payload_immutable(
    target: LibraryImportRow,
    value: dict[str, Any],
    old_value: object,
    _initiator: object,
) -> dict[str, Any]:
    """Reject ORM replacement of a persisted raw import snapshot."""
    redaction_allowed = getattr(target, "_allow_source_payload_redaction", False)
    if (
        sqlalchemy_inspect(target).persistent
        and old_value != value
        and not (redaction_allowed and value == {})
    ):
        raise ValueError("library_import_source_payload_is_immutable")
    return value


class LibraryExportRun(Base):
    __tablename__ = "library_export_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('generated', 'failed')",
            name="ck_library_export_runs_status",
        ),
        CheckConstraint(
            "export_format IN ('csv', 'xlsx')",
            name="ck_library_export_runs_format",
        ),
        CheckConstraint(
            "row_count >= 0 AND byte_count >= 0",
            name="ck_library_export_runs_counts",
        ),
        CheckConstraint(
            "content_hash IS NULL OR length(content_hash) = 64",
            name="ck_library_export_runs_content_hash",
        ),
        CheckConstraint(
            (
                "(status = 'generated' AND content_hash IS NOT NULL "
                "AND failure_code IS NULL) OR "
                "(status = 'failed' AND content_hash IS NULL "
                "AND row_count = 0 AND byte_count = 0 "
                "AND failure_code IS NOT NULL)"
            ),
            name="ck_library_export_runs_status_payload",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    admin_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_admins.id", ondelete="SET NULL"),
        index=True,
    )
    schema_version: Mapped[str] = mapped_column(String(64), nullable=False)
    export_format: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        default="generated",
        nullable=False,
    )
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action_key: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
    )
    request_fingerprint: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    byte_count: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    filters_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    recommended_delete_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    failure_code: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
