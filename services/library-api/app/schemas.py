from enum import StrEnum
from datetime import datetime
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class AcademicRole(StrEnum):
    UNDERGRADUATE = "undergraduate"
    MASTER = "master"
    DOCTORAL = "doctoral"
    STAFF = "staff"


class FacultyCode(StrEnum):
    PHARMACY = "pharmacy"
    OTHER = "other"


class ExistingRegistration(StrEnum):
    NONE = "none"
    MATCHING = "matching"
    CONFLICT = "conflict"


class EligibilityStatus(StrEnum):
    NOT_READY = "not_ready"
    APPROVED = "approved"
    MANUAL_REVIEW = "manual_review"
    INELIGIBLE = "ineligible"
    ALREADY_REGISTERED = "already_registered"


class ReasonCode(StrEnum):
    ACCOUNT_NOT_VERIFIED = "account_not_verified"
    TOKEN_INVALID = "token_invalid"
    EMAIL_NOT_VERIFIED = "email_not_verified"
    HOSTED_DOMAIN_NOT_ALLOWED = "hosted_domain_not_allowed"
    EMAIL_DOMAIN_NOT_ALLOWED = "email_domain_not_allowed"
    FULL_NAME_REQUIRED = "full_name_required"
    ACADEMIC_ROLE_REQUIRED = "academic_role_required"
    FACULTY_REQUIRED = "faculty_required"
    GRADE_REQUIRED = "grade_required"
    GRADE_INVALID = "grade_invalid"
    STUDENT_NUMBER_REQUIRED = "student_number_required"
    STUDENT_NUMBER_INVALID = "student_number_invalid"
    TERMS_REQUIRED = "terms_required"
    PRIVACY_REQUIRED = "privacy_required"
    EXISTING_REGISTRATION_FOUND = "existing_registration_found"
    EXISTING_REGISTRATION_CONFLICT = "existing_registration_conflict"
    ROLE_REQUIRES_MANUAL_REVIEW = "role_requires_manual_review"
    FACULTY_REQUIRES_MANUAL_REVIEW = "faculty_requires_manual_review"
    NON_STUDENT_EMAIL_REQUIRES_MANUAL_REVIEW = "non_student_email_requires_manual_review"
    ELIGIBLE = "eligible"


class AdminExportPurposeCode(StrEnum):
    """Allowlisted, non-PII purposes for a Phase 10A roster export."""

    PERIODIC_ROSTER_REVIEW = "periodic_roster_review"
    DRIVE_ACCESS_RECONCILIATION = "drive_access_reconciliation"
    INCIDENT_RESPONSE = "incident_response"


class AccountFacts(ApiModel):
    verified: bool
    token_valid: bool
    email_verified: bool
    email: str = Field(max_length=320)
    hosted_domain: str = Field(max_length=255)
    allowed_hosted_domains: list[str] = Field(min_length=1, max_length=20)


class RegistrationInput(ApiModel):
    full_name: str = Field(max_length=200)
    academic_role: AcademicRole | Literal[""] = ""
    faculty: FacultyCode | Literal[""] = ""
    grade: str = Field(max_length=16)
    student_number: str = Field(max_length=32)
    terms_accepted: bool
    privacy_accepted: bool
    question: str = Field(max_length=1000)


class EligibilityRequest(ApiModel):
    account: AccountFacts
    registration: RegistrationInput
    existing_registration: ExistingRegistration = ExistingRegistration.NONE


class EligibilityResponse(ApiModel):
    status: EligibilityStatus
    reasons: list[ReasonCode]
    normalized_email: str
    normalized_student_number: str
    requires_student_details: bool


class Phase5RegistrationResponse(EligibilityResponse):
    persisted: bool
    replayed: bool
    application_id: UUID | None = None
    member_id: UUID | None = None


class Phase5DatabaseHealth(ApiModel):
    status: str
    phase: str
    dialect: str
    external_side_effects_enabled: bool


class Phase6AuthenticationResponse(ApiModel):
    status: Literal["verified"] = "verified"
    email: str
    hosted_domain: str


class Phase6RegistrationRequest(ApiModel):
    registration: RegistrationInput


class Phase6RegistrationResponse(EligibilityResponse):
    persisted: bool
    replayed: bool
    application_id: UUID | None = None
    identity_linked: bool
    drive_access_status: Literal[
        "not_enqueued",
        "pending",
        "granted",
        "already_granted",
        "failed",
        "revoked",
    ]
    drive_notification_status: Literal[
        "pending",
        "sent_by_drive",
        "not_applicable",
        "failed",
    ]


class Phase6AdminAuthorizationResponse(ApiModel):
    authorized: Literal[True] = True
    role: Literal["viewer", "operator", "admin"]


class Phase7ProcessRequest(ApiModel):
    limit: int = Field(default=10, ge=1, le=20)


class Phase7OperationResult(ApiModel):
    operation_id: UUID
    status: Literal["succeeded", "failed", "dead"]
    error_code: str | None = None


class Phase7ProcessResponse(ApiModel):
    processed: int
    succeeded: int
    failed: int
    dead: int
    results: list[Phase7OperationResult]


class Phase7RevokeResponse(ApiModel):
    operation_id: UUID
    status: Literal["pending", "running", "succeeded", "failed", "dead"]


class Phase7RetryResponse(ApiModel):
    operation_id: UUID
    status: Literal["pending"]


class Phase7RegistrationStatusResponse(ApiModel):
    application_id: UUID
    drive_access_status: Literal[
        "not_enqueued",
        "pending",
        "granted",
        "already_granted",
        "failed",
        "revoked",
    ]
    drive_notification_status: Literal[
        "pending",
        "sent_by_drive",
        "not_applicable",
        "failed",
    ]


class AdminSessionResponse(ApiModel):
    authorized: Literal[True] = True
    role: Literal["viewer", "operator", "admin"]
    mutations_enabled: bool
    export_enabled: bool


class AdminApplicationItem(ApiModel):
    application_id: UUID
    member_id: UUID | None
    operation_id: UUID | None
    full_name: str
    email: str
    student_number: str | None
    academic_role: str
    faculty_code: str
    grade: str | None
    eligibility_status: str
    reason_codes: list[str]
    admin_decision: str
    record_version: int
    member_status: str | None
    member_record_version: int | None
    drive_access_status: str
    drive_permission_managed: bool
    operation_status: str | None
    operation_record_version: int | None
    operation_error_code: str | None
    created_at: datetime


class AdminApplicationListResponse(ApiModel):
    items: list[AdminApplicationItem]
    offset: int
    limit: int
    has_more: bool


class AdminApplicationSearchRequest(ApiModel):
    q: str | None = Field(default=None, max_length=200)
    decision: str | None = Field(default=None, max_length=32)
    drive_status: str | None = Field(default=None, max_length=32)
    offset: int = Field(default=0, ge=0, le=100_000)
    limit: int = Field(default=25, ge=1, le=50)


class AdminMemberItem(ApiModel):
    member_id: UUID
    full_name: str
    grade: Literal[
        "1年",
        "2年",
        "3年",
        "4年",
        "5年",
        "6年",
        "M1",
        "M2",
        "その他",
    ]
    student_number: str | None
    registered_at: datetime | None
    member_status: str
    record_version: int


class AdminMemberListResponse(ApiModel):
    items: list[AdminMemberItem]
    offset: int
    limit: int
    has_more: bool


class AdminMemberSearchRequest(ApiModel):
    q: str | None = Field(default=None, max_length=200)
    grade: Literal[
        "1年",
        "2年",
        "3年",
        "4年",
        "5年",
        "6年",
        "M1",
        "M2",
        "その他",
    ] | None = None
    member_status: Literal[
        "active",
        "pending_review",
        "inactive",
        "all",
    ] = "active"
    sort_by: Literal["grade", "student_number", "registered_at"] = "grade"
    sort_direction: Literal["asc", "desc"] = "asc"
    offset: int = Field(default=0, ge=0, le=100_000)
    limit: int = Field(default=25, ge=1, le=100)


class AdminApplicationDetail(AdminApplicationItem):
    question: str | None
    decision_reason: str | None


class AdminReasonRequest(ApiModel):
    reason: str = Field(min_length=8, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 8:
            raise ValueError("reason must contain at least 8 non-whitespace characters")
        return normalized


class AdminDecisionRequest(AdminReasonRequest):
    decision: Literal["approve", "reject"]
    expected_record_version: int = Field(ge=1)


class AdminMutationResponse(ApiModel):
    status: str
    application_id: UUID | None = None
    member_id: UUID | None = None
    operation_id: UUID | None = None
    record_version: int | None = None


class AdminRetryRequest(AdminReasonRequest):
    expected_record_version: int = Field(ge=1)


class AdminRevokeRequest(AdminReasonRequest):
    expected_record_version: int = Field(ge=1)
    confirmed_member_id: UUID


class AdminAuditItem(ApiModel):
    audit_id: UUID
    action: str
    actor_role: str
    result: str
    member_id: UUID | None
    application_id: UUID | None
    operation_id: UUID | None
    reason: str | None
    request_id: str
    created_at: datetime


class AdminAuditListResponse(ApiModel):
    items: list[AdminAuditItem]
    offset: int
    limit: int
    has_more: bool


class AdminExportRequest(ApiModel):
    """Non-PII, allowlisted controls for a Phase 10A roster snapshot."""

    format: Literal["csv", "xlsx"]
    member_status: Literal[
        "active",
        "pending_review",
        "inactive",
        "all",
    ] = "active"
    academic_role: Literal[
        "undergraduate",
        "master",
        "doctoral",
        "staff",
    ] | None = None
    purpose_code: AdminExportPurposeCode
    confirmed: Literal[True]
