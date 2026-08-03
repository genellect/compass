import re
import unicodedata

from app.schemas import (
    AcademicRole,
    AccountFacts,
    EligibilityResponse,
    EligibilityStatus,
    ExistingRegistration,
    FacultyCode,
    ReasonCode,
    RegistrationInput,
)


STUDENT_NUMBER_PATTERN = re.compile(r"^(PP|PL|MP)[0-9]{5}$")
UNIVERSITY_EMAIL_PATTERN = re.compile(
    r"@([a-z0-9-]+\.)*kitasato-u\.ac\.jp$",
    re.IGNORECASE,
)


def normalize_student_number(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().upper()


def normalize_email(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lower()


def is_student_number_valid(value: str) -> bool:
    normalized = normalize_student_number(value)
    return bool(STUDENT_NUMBER_PATTERN.fullmatch(normalized)) and normalized != "PP00000"


def is_student_role(role: AcademicRole | str) -> bool:
    return role in (AcademicRole.UNDERGRADUATE, AcademicRole.MASTER)


def is_student_email(email: str) -> bool:
    return normalize_email(email).endswith("@st.kitasato-u.ac.jp")


def is_university_email(email: str) -> bool:
    return bool(UNIVERSITY_EMAIL_PATTERN.search(normalize_email(email)))


def evaluate_eligibility(
    account: AccountFacts,
    registration: RegistrationInput,
    existing_registration: ExistingRegistration = ExistingRegistration.NONE,
) -> EligibilityResponse:
    normalized_email = normalize_email(account.email)
    normalized_student_number = normalize_student_number(registration.student_number)
    requires_student_details = is_student_role(registration.academic_role)

    def response(
        status: EligibilityStatus,
        reasons: list[ReasonCode],
    ) -> EligibilityResponse:
        return EligibilityResponse(
            status=status,
            reasons=reasons,
            normalized_email=normalized_email,
            normalized_student_number=normalized_student_number,
            requires_student_details=requires_student_details,
        )

    if not account.verified:
        return response(
            EligibilityStatus.NOT_READY,
            [ReasonCode.ACCOUNT_NOT_VERIFIED],
        )

    authentication_failures: list[ReasonCode] = []
    if not account.token_valid:
        authentication_failures.append(ReasonCode.TOKEN_INVALID)
    if not account.email_verified:
        authentication_failures.append(ReasonCode.EMAIL_NOT_VERIFIED)
    allowed_domains = {normalize_email(value) for value in account.allowed_hosted_domains}
    if normalize_email(account.hosted_domain) not in allowed_domains:
        authentication_failures.append(ReasonCode.HOSTED_DOMAIN_NOT_ALLOWED)
    if not is_university_email(normalized_email):
        authentication_failures.append(ReasonCode.EMAIL_DOMAIN_NOT_ALLOWED)
    if authentication_failures:
        return response(EligibilityStatus.INELIGIBLE, authentication_failures)

    missing_fields: list[ReasonCode] = []
    if not registration.full_name.strip():
        missing_fields.append(ReasonCode.FULL_NAME_REQUIRED)
    if not registration.academic_role:
        missing_fields.append(ReasonCode.ACADEMIC_ROLE_REQUIRED)
    if not registration.faculty:
        missing_fields.append(ReasonCode.FACULTY_REQUIRED)
    if not registration.privacy_accepted:
        missing_fields.append(ReasonCode.PRIVACY_REQUIRED)
    if requires_student_details:
        if not registration.grade:
            missing_fields.append(ReasonCode.GRADE_REQUIRED)
        if not normalized_student_number:
            missing_fields.append(ReasonCode.STUDENT_NUMBER_REQUIRED)
        if not registration.terms_accepted:
            missing_fields.append(ReasonCode.TERMS_REQUIRED)
    if missing_fields:
        return response(EligibilityStatus.NOT_READY, missing_fields)

    valid_grades = {
        AcademicRole.UNDERGRADUATE: {"1", "2", "3", "4", "5", "6"},
        AcademicRole.MASTER: {"1", "2"},
    }
    if (
        requires_student_details
        and registration.grade not in valid_grades[registration.academic_role]
    ):
        return response(
            EligibilityStatus.INELIGIBLE,
            [ReasonCode.GRADE_INVALID],
        )

    if requires_student_details and not is_student_number_valid(normalized_student_number):
        return response(
            EligibilityStatus.INELIGIBLE,
            [ReasonCode.STUDENT_NUMBER_INVALID],
        )

    if existing_registration == ExistingRegistration.MATCHING:
        return response(
            EligibilityStatus.ALREADY_REGISTERED,
            [ReasonCode.EXISTING_REGISTRATION_FOUND],
        )
    if existing_registration == ExistingRegistration.CONFLICT:
        return response(
            EligibilityStatus.MANUAL_REVIEW,
            [ReasonCode.EXISTING_REGISTRATION_CONFLICT],
        )

    manual_review_reasons: list[ReasonCode] = []
    if registration.academic_role in (AcademicRole.DOCTORAL, AcademicRole.STAFF):
        manual_review_reasons.append(ReasonCode.ROLE_REQUIRES_MANUAL_REVIEW)
    if registration.faculty != FacultyCode.PHARMACY:
        manual_review_reasons.append(ReasonCode.FACULTY_REQUIRES_MANUAL_REVIEW)
    if not is_student_email(normalized_email):
        manual_review_reasons.append(ReasonCode.NON_STUDENT_EMAIL_REQUIRES_MANUAL_REVIEW)
    if manual_review_reasons:
        return response(EligibilityStatus.MANUAL_REVIEW, manual_review_reasons)

    return response(EligibilityStatus.APPROVED, [ReasonCode.ELIGIBLE])
