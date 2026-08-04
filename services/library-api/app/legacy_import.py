from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import re
import unicodedata
from typing import Any, Mapping, Sequence
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    LibraryAccessGrant,
    LibraryAdmin,
    LibraryAdminAudit,
    LibraryApplication,
    LibraryIdentity,
    LibraryImportBatch,
    LibraryImportRow,
    LibraryMember,
    LibraryOperation,
)
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.eligibility import is_student_number_valid, normalize_email
from app.roster import roster_grade_label


BASE_SOURCE_SYSTEMS = ("google_form", "management_sheet", "drive_permission")
MEMBER_ROSTER_SOURCE = "member_roster"
SOURCE_SYSTEMS = (*BASE_SOURCE_SYSTEMS, MEMBER_ROSTER_SOURCE)
DEFAULT_RAW_SNAPSHOT_RETENTION_DAYS = 90
MAX_RAW_SNAPSHOT_RETENTION_DAYS = 3650
ALLOWED_WORKSPACE_DOMAIN = "st.kitasato-u.ac.jp"
READY_CLASSIFICATION = "ready"
MANUAL_CLASSIFICATION = "manual_resolution"
EXCLUDED_CLASSIFICATION = "excluded"
STUDENT_ROLES = {"undergraduate", "master"}
ALLOWED_ROLES = STUDENT_ROLES | {"doctoral", "staff"}
ACCEPTED_CONSENT_VALUES = {
    "1",
    "true",
    "yes",
    "はい",
    "同意する",
    "同意しました",
    "理解しました",
}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
LEGACY_SHEET_TIMEZONE = ZoneInfo("Asia/Dili")


def _source_systems_are_supported(values: object) -> bool:
    if not isinstance(values, (set, frozenset, list, tuple, dict)):
        return False
    keys = set(values)
    return set(BASE_SOURCE_SYSTEMS).issubset(keys) and keys.issubset(
        set(SOURCE_SYSTEMS)
    )


class LegacyImportError(RuntimeError):
    pass


class LegacyImportStateError(LegacyImportError):
    pass


class LegacyImportIntegrityError(LegacyImportError):
    pass


class LegacyImportConflictError(LegacyImportError):
    pass


@dataclass(frozen=True)
class LegacySourceRow:
    source_row_number: int
    source_payload: Mapping[str, Any]


@dataclass(frozen=True)
class LegacySnapshotSource:
    """One read-only source captured at the batch reference time.

    ``snapshot_bytes`` is used only to compute the exact artifact SHA-256. It is
    not retained by this service and must never be logged.
    """

    snapshot_bytes: bytes
    rows: Sequence[LegacySourceRow]


@dataclass(frozen=True)
class LegacyImportStageResult:
    batch_id: UUID
    status: str
    replayed: bool
    report: dict[str, Any]


@dataclass(frozen=True)
class LegacyImportApprovalResult:
    batch_id: UUID
    status: str
    replayed: bool
    record_version: int


@dataclass(frozen=True)
class LegacyImportApplyResult:
    batch_id: UUID
    status: str
    replayed: bool
    created_members: int
    reused_members: int
    created_access_grants: int
    reused_access_grants: int
    skipped_rows: int


@dataclass(frozen=True)
class LegacyImportRollbackResult:
    batch_id: UUID
    status: str
    replayed: bool
    deleted_members: int
    deleted_access_grants: int


@dataclass(frozen=True)
class LegacyImportHoldResult:
    batch_id: UUID
    legal_hold: bool
    replayed: bool
    record_version: int


@dataclass
class _WorkingRow:
    source_system: str
    source_row_number: int
    source_payload: dict[str, Any]
    normalized_payload: dict[str, Any]
    issues: set[str]
    excluded: bool = False

    @property
    def classification(self) -> str:
        if self.excluded:
            return EXCLUDED_CLASSIFICATION
        if self.issues:
            return MANUAL_CLASSIFICATION
        return READY_CLASSIFICATION


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _require_fingerprint_key(key: bytes) -> None:
    if len(key) < 32:
        raise ValueError("legacy import fingerprint key must be at least 32 bytes")


def _hmac_hex(key: bytes, value: object) -> str:
    return hmac.new(key, _canonical_json(value), hashlib.sha256).hexdigest()


def _source_row_fingerprint(
    key: bytes,
    *,
    source_system: str,
    source_row_number: int,
    raw_payload_hash: str,
) -> str:
    return _hmac_hex(
        key,
        {
            "source_system": source_system,
            "source_row_number": source_row_number,
            "raw_payload_hmac": raw_payload_hash,
        },
    )


def drive_resource_fingerprint(key: bytes, drive_resource_id: str) -> str:
    _require_fingerprint_key(key)
    resource_id = _clean_text(drive_resource_id)
    if not resource_id:
        raise ValueError("drive_resource_id is required")
    return _hmac_hex(
        key,
        {"purpose": "phase9-target-drive-resource", "resource_id": resource_id},
    )


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("reference_at must be timezone-aware")
    return value.astimezone(UTC)


def _stored_utc(value: datetime) -> datetime:
    """Treat timezone-naive SQLite round-trips as stored UTC values."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(unicodedata.normalize("NFKC", str(value)).split())
    return cleaned or None


def _name_key(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    return cleaned.casefold() if cleaned else None


def _get(payload: Mapping[str, Any], *keys: str) -> object | None:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


def _email(value: object) -> str | None:
    cleaned = _clean_text(value)
    return normalize_email(cleaned) if cleaned else None


def _is_allowed_workspace_email(value: str | None) -> bool:
    if not value or "@" not in value:
        return False
    return value.rsplit("@", 1)[1] == ALLOWED_WORKSPACE_DOMAIN


def _student_number(value: object) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    return re.sub(r"[\s-]", "", cleaned).upper()


def _consent(value: object) -> bool:
    if value is True:
        return True
    cleaned = _clean_text(value)
    return bool(cleaned and cleaned.casefold() in ACCEPTED_CONSENT_VALUES)


def _legacy_registered_at(
    source_system: str,
    payload: Mapping[str, Any],
) -> tuple[str | None, bool]:
    source_keys = {
        "google_form": ("タイムスタンプ",),
        "management_sheet": ("処理日時",),
        MEMBER_ROSTER_SOURCE: ("登録日時",),
    }
    cleaned = _clean_text(
        _get(payload, *source_keys.get(source_system, ()), "registered_at")
    )
    if not cleaned:
        return None, False
    parsed: datetime | None = None
    for format_string in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(cleaned, format_string)
            break
        except ValueError:
            continue
    if parsed is None:
        try:
            parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        except ValueError:
            return None, True
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=LEGACY_SHEET_TIMEZONE)
    return parsed.astimezone(UTC).isoformat(), False


def _normalize_role_and_grade(payload: Mapping[str, Any]) -> tuple[str | None, str | None, set[str]]:
    issues: set[str] = set()
    explicit_role = _clean_text(_get(payload, "academic_role"))
    explicit_grade = _clean_text(_get(payload, "grade"))
    legacy_grade = _clean_text(_get(payload, "学年"))
    role = explicit_role.casefold() if explicit_role else None
    grade = explicit_grade

    if role and role not in ALLOWED_ROLES:
        issues.add("invalid_academic_role")
        role = None
    if role is None and legacy_grade in {"1年", "2年", "3年", "4年"}:
        role = "undergraduate"
        grade = legacy_grade[0]
    elif role is None and legacy_grade in {
        "5年 / 修士1年",
        "6年 / 修士2年",
        "教員 / 大学担当者 / 博士課程",
    }:
        issues.add("ambiguous_academic_role")
    elif role is None:
        issues.add("missing_academic_role")

    if role in STUDENT_ROLES:
        if not grade:
            issues.add("missing_grade")
        elif role == "undergraduate" and grade not in {"1", "2", "3", "4", "5", "6"}:
            issues.add("invalid_grade")
        elif role == "master" and grade not in {"1", "2"}:
            issues.add("invalid_grade")
    elif role in {"doctoral", "staff"}:
        issues.add("role_requires_manual_resolution")
    return role, grade, issues


def _normalize_non_drive(
    source_system: str,
    payload: Mapping[str, Any],
) -> tuple[dict[str, Any], set[str], bool]:
    issues: set[str] = set()
    registered_at_utc, invalid_registered_at = _legacy_registered_at(
        source_system,
        payload,
    )
    if invalid_registered_at:
        issues.add("invalid_source_timestamp")
    application_type = _clean_text(
        _get(payload, "申請種別", "application_type")
    )
    if application_type and (
        "問い合わせ" in application_type or "inquiry" in application_type.casefold()
    ):
        return {"application_type": application_type}, {"non_registration_record"}, True

    email_fields: dict[str, str] = {}
    aliases = {
        "collected": ("自動収集メール", "auto_collected_email"),
        "input": (
            "入力大学メール",
            "入力メール",
            "大学メールアドレス",
            "input_email",
        ),
    }
    if source_system == "management_sheet":
        aliases["invitation"] = ("招待対象メール", "invitation_email")
    for label, keys in aliases.items():
        candidate = _email(_get(payload, *keys))
        if candidate:
            email_fields[label] = candidate
    distinct_emails = sorted(set(email_fields.values()))
    normalized_email = distinct_emails[0] if len(distinct_emails) == 1 else None
    if not distinct_emails:
        issues.add("missing_email")
    elif len(distinct_emails) > 1:
        issues.add("conflicting_email_fields")
    if any(not _is_allowed_workspace_email(email) for email in distinct_emails):
        issues.add("email_domain_not_allowed")

    full_name = _clean_text(_get(payload, "氏名", "full_name"))
    if not full_name:
        issues.add("missing_name")
    student_number = _student_number(
        _get(payload, "学籍番号", "student_number")
    )
    role, grade, role_issues = _normalize_role_and_grade(payload)
    issues.update(role_issues)
    faculty_value = _clean_text(_get(payload, "所属学部", "faculty_code"))
    if faculty_value == "薬学部":
        faculty = "pharmacy"
    else:
        faculty = faculty_value.casefold() if faculty_value else None
    if not faculty:
        issues.add("missing_faculty")
    elif faculty != "pharmacy":
        issues.add("faculty_not_pharmacy")

    if role in STUDENT_ROLES:
        if not student_number:
            issues.add("missing_student_number")
        elif not is_student_number_valid(student_number):
            issues.add("invalid_student_number")

    terms_value = _get(
        payload,
        "利用規約回答",
        "利用規約への同意",
        "利用規約",
        "terms_accepted",
    )
    privacy_value = _get(
        payload,
        "個人情報回答",
        "個人情報の取り扱いへの同意",
        "個人情報",
        "privacy_accepted",
    )
    terms_accepted = _consent(terms_value)
    privacy_accepted = _consent(privacy_value)
    if not terms_accepted:
        issues.add("missing_terms_consent")
    if not privacy_accepted:
        issues.add("missing_privacy_consent")

    return (
        {
            "normalized_email": normalized_email,
            "email_fields": email_fields,
            "full_name": full_name,
            "normalized_student_number": student_number,
            "academic_role": role,
            "faculty_code": faculty,
            "grade": grade,
            "terms_accepted": terms_accepted,
            "privacy_accepted": privacy_accepted,
            "application_type": application_type,
            "registered_at_utc": registered_at_utc,
        },
        issues,
        False,
    )


def _normalize_member_roster(
    payload: Mapping[str, Any],
) -> tuple[dict[str, Any], set[str], bool]:
    """Normalize an owner-confirmed member row without inventing identity data."""

    issues: set[str] = set()
    full_name = _clean_text(_get(payload, "氏名", "full_name"))
    if not full_name:
        issues.add("missing_name")

    student_number = _student_number(
        _get(payload, "学籍番号", "student_number")
    )
    if student_number:
        if len(student_number) > 16:
            issues.add("student_number_too_long")
        elif not is_student_number_valid(student_number):
            issues.add("invalid_student_number")

    raw_grade = _clean_text(_get(payload, "学年", "roster_grade", "grade"))
    grade_key = (raw_grade or "").upper().replace(" ", "")
    if grade_key in {str(year) for year in range(1, 7)}:
        academic_role = "undergraduate"
        grade = grade_key
        roster_grade = f"{grade_key}年"
    elif grade_key in {f"{year}年" for year in range(1, 7)}:
        academic_role = "undergraduate"
        grade = grade_key[0]
        roster_grade = grade_key
    elif grade_key in {"M1", "修士1年"}:
        academic_role = "master"
        grade = "1"
        roster_grade = "M1"
    elif grade_key in {"M2", "修士2年"}:
        academic_role = "master"
        grade = "2"
        roster_grade = "M2"
    else:
        # The roster intentionally groups alumni, staff and doctoral members as
        # "その他". Preserve that uncertainty instead of inferring a role.
        academic_role = "legacy_other"
        grade = None
        roster_grade = "その他"

    registered_at_utc, invalid_registered_at = _legacy_registered_at(
        MEMBER_ROSTER_SOURCE,
        payload,
    )
    if invalid_registered_at:
        issues.add("invalid_source_timestamp")

    return (
        {
            "normalized_email": None,
            "full_name": full_name,
            "normalized_student_number": student_number,
            "academic_role": academic_role,
            "faculty_code": "legacy_unknown",
            "grade": grade,
            "roster_grade": roster_grade,
            "registered_at_utc": registered_at_utc,
        },
        issues,
        False,
    )


def _normalize_drive(
    payload: Mapping[str, Any],
) -> tuple[dict[str, Any], set[str], bool]:
    issues: set[str] = set()
    permission_id = _clean_text(_get(payload, "permission_id", "id"))
    email_address = _email(_get(payload, "emailAddress", "email"))
    role = _clean_text(_get(payload, "role"))
    permission_type = _clean_text(_get(payload, "type"))
    if not permission_id:
        issues.add("missing_permission_id")
    if not email_address:
        issues.add("missing_permission_email")
    elif not _is_allowed_workspace_email(email_address):
        issues.add("email_domain_not_allowed")
    if not role:
        issues.add("missing_permission_role")
    if permission_type != "user":
        issues.add("unsupported_permission_type")
        return (
            {
                "normalized_email": email_address,
                "permission_id": permission_id,
                "permission_role": role,
                "permission_type": permission_type,
            },
            issues,
            True,
        )
    return (
        {
            "normalized_email": email_address,
            "permission_id": permission_id,
            "permission_role": role,
            "permission_type": permission_type,
        },
        issues,
        False,
    )


def _normalize_source_row(
    source_system: str,
    source_row: LegacySourceRow,
) -> _WorkingRow:
    if source_row.source_row_number <= 0:
        raise ValueError("source_row_number must be positive")
    raw = deepcopy(dict(source_row.source_payload))
    # Fail before staging if the payload is not JSON serializable.
    _canonical_json(raw)
    if source_system == "drive_permission":
        normalized, issues, excluded = _normalize_drive(raw)
    elif source_system == MEMBER_ROSTER_SOURCE:
        normalized, issues, excluded = _normalize_member_roster(raw)
    else:
        normalized, issues, excluded = _normalize_non_drive(source_system, raw)
    return _WorkingRow(
        source_system=source_system,
        source_row_number=source_row.source_row_number,
        source_payload=raw,
        normalized_payload=normalized,
        issues=issues,
        excluded=excluded,
    )


def _mark_duplicates(rows: list[_WorkingRow]) -> None:
    for source_system in SOURCE_SYSTEMS:
        source_rows = [
            row for row in rows if row.source_system == source_system and not row.excluded
        ]
        for field, code in (
            ("normalized_email", "duplicate_email_in_source"),
            ("normalized_student_number", "duplicate_student_number_in_source"),
        ):
            grouped: dict[str, list[_WorkingRow]] = defaultdict(list)
            for row in source_rows:
                value = row.normalized_payload.get(field)
                if value:
                    grouped[str(value)].append(row)
            for duplicate_rows in grouped.values():
                if len(duplicate_rows) > 1:
                    for row in duplicate_rows:
                        row.issues.add(code)

    unkeyed_roster_names: dict[str, list[_WorkingRow]] = defaultdict(list)
    for row in rows:
        if (
            row.source_system != MEMBER_ROSTER_SOURCE
            or row.excluded
            or row.normalized_payload.get("normalized_student_number")
        ):
            continue
        name = _name_key(row.normalized_payload.get("full_name"))
        if name:
            unkeyed_roster_names[name].append(row)
    for duplicate_rows in unkeyed_roster_names.values():
        if len(duplicate_rows) > 1:
            for row in duplicate_rows:
                row.issues.add("duplicate_unkeyed_roster_name")

    permission_ids: dict[str, list[_WorkingRow]] = defaultdict(list)
    permission_emails: dict[str, list[_WorkingRow]] = defaultdict(list)
    for row in rows:
        if row.source_system != "drive_permission" or row.excluded:
            continue
        permission_id = row.normalized_payload.get("permission_id")
        email = row.normalized_payload.get("normalized_email")
        if permission_id:
            permission_ids[str(permission_id)].append(row)
        if email:
            permission_emails[str(email)].append(row)
    for duplicates in permission_ids.values():
        if len(duplicates) > 1:
            for row in duplicates:
                row.issues.add("duplicate_permission_id")
    for duplicates in permission_emails.values():
        if len(duplicates) > 1:
            for row in duplicates:
                row.issues.add("duplicate_permission_email")


def _mark_cross_source_conflicts(rows: list[_WorkingRow]) -> None:
    roster_by_email: dict[str, list[_WorkingRow]] = defaultdict(list)
    drive_by_email: dict[str, list[_WorkingRow]] = defaultdict(list)
    student_to_rows: dict[str, list[_WorkingRow]] = defaultdict(list)
    for row in rows:
        if row.excluded:
            continue
        email = row.normalized_payload.get("normalized_email")
        if row.source_system == "drive_permission":
            if email:
                drive_by_email[str(email)].append(row)
            continue
        if email:
            roster_by_email[str(email)].append(row)
        student_number = row.normalized_payload.get("normalized_student_number")
        if student_number:
            student_to_rows[str(student_number)].append(row)

    for linked_rows in roster_by_email.values():
        names = {
            value
            for value in (
                _name_key(row.normalized_payload.get("full_name"))
                for row in linked_rows
            )
            if value
        }
        student_numbers = {
            str(row.normalized_payload["normalized_student_number"])
            for row in linked_rows
            if row.normalized_payload.get("normalized_student_number")
        }
        roles = {
            str(row.normalized_payload["academic_role"])
            for row in linked_rows
            if row.normalized_payload.get("academic_role")
        }
        faculties = {
            str(row.normalized_payload["faculty_code"])
            for row in linked_rows
            if row.normalized_payload.get("faculty_code")
        }
        grades = {
            str(row.normalized_payload["grade"])
            for row in linked_rows
            if row.normalized_payload.get("grade")
        }
        for values, code in (
            (names, "conflicting_name_across_sources"),
            (student_numbers, "conflicting_student_number_across_sources"),
            (roles, "conflicting_academic_role_across_sources"),
            (faculties, "conflicting_faculty_across_sources"),
            (grades, "conflicting_grade_across_sources"),
        ):
            if len(values) > 1:
                for row in linked_rows:
                    row.issues.add(code)

        source_set = {row.source_system for row in linked_rows}
        if "google_form" not in source_set:
            for row in linked_rows:
                row.issues.add("missing_google_form_response")
        if "management_sheet" not in source_set:
            for row in linked_rows:
                row.issues.add("missing_management_record")

    for linked_rows in student_to_rows.values():
        emails = {
            str(row.normalized_payload["normalized_email"])
            for row in linked_rows
            if row.normalized_payload.get("normalized_email")
        }
        if len(emails) > 1:
            for row in linked_rows:
                row.issues.add("conflicting_email_for_student_number")
        member_roster_rows = [
            row
            for row in linked_rows
            if row.source_system == MEMBER_ROSTER_SOURCE
        ]
        identity_backed_rows = [
            row
            for row in linked_rows
            if row.source_system in {"google_form", "management_sheet"}
        ]
        if member_roster_rows and identity_backed_rows:
            names = {
                value
                for value in (
                    _name_key(row.normalized_payload.get("full_name"))
                    for row in linked_rows
                )
                if value
            }
            if len(names) > 1:
                for row in linked_rows:
                    row.issues.add("conflicting_name_for_student_number")

    for email, linked_rows in roster_by_email.items():
        permissions = drive_by_email.get(email, [])
        if not permissions:
            for row in linked_rows:
                row.issues.add("missing_drive_permission")
    for email, permission_rows in drive_by_email.items():
        if email not in roster_by_email:
            for row in permission_rows:
                row.issues.add("drive_permission_without_roster")

    # If one source row needs human resolution, never auto-apply a matching row
    # from another source by itself.
    for email in set(roster_by_email) | set(drive_by_email):
        linked = roster_by_email.get(email, []) + drive_by_email.get(email, [])
        if any(row.issues and not row.excluded for row in linked):
            for row in linked:
                if not row.excluded:
                    row.issues.add("linked_record_requires_manual_resolution")


def _mark_operational_conflicts(session: Session, rows: list[_WorkingRow]) -> None:
    emails = {
        str(row.normalized_payload["normalized_email"])
        for row in rows
        if row.source_system != "drive_permission"
        and row.normalized_payload.get("normalized_email")
    }
    student_numbers = {
        str(row.normalized_payload["normalized_student_number"])
        for row in rows
        if row.source_system != "drive_permission"
        and row.normalized_payload.get("normalized_student_number")
    }
    unkeyed_roster_names = {
        name
        for name in (
            _name_key(row.normalized_payload.get("full_name"))
            for row in rows
            if row.source_system == MEMBER_ROSTER_SOURCE
            and not row.excluded
            and not row.normalized_payload.get("normalized_student_number")
        )
        if name
    }
    if not emails and not student_numbers and not unkeyed_roster_names:
        return
    member_conditions = []
    if emails:
        member_conditions.append(LibraryMember.normalized_email.in_(emails))
    if student_numbers:
        member_conditions.append(
            LibraryMember.normalized_student_number.in_(student_numbers)
        )
    if unkeyed_roster_names:
        member_conditions.append(
            LibraryMember.normalized_student_number.is_(None)
        )
    members = list(
        session.scalars(
            select(LibraryMember).where(
                or_(*member_conditions)
            )
        )
    )
    by_email = {
        member.normalized_email: member
        for member in members
        if member.normalized_email
    }
    by_student = {
        member.normalized_student_number: member
        for member in members
        if member.normalized_student_number
    }
    unkeyed_by_name: dict[str, list[LibraryMember]] = defaultdict(list)
    for member in members:
        if member.normalized_student_number is not None:
            continue
        name = _name_key(member.full_name)
        if name in unkeyed_roster_names:
            unkeyed_by_name[str(name)].append(member)
    identities = list(
        session.scalars(
            select(LibraryIdentity).where(
                LibraryIdentity.member_id.in_([member.id for member in members] or [UUID(int=0)]),
                LibraryIdentity.unlinked_at.is_(None),
            )
        )
    )
    identity_emails: dict[UUID, set[str]] = defaultdict(set)
    for identity in identities:
        identity_emails[identity.member_id].add(identity.verified_email)

    for row in rows:
        if row.source_system == "drive_permission" or row.excluded:
            continue
        email = row.normalized_payload.get("normalized_email")
        student_number = row.normalized_payload.get("normalized_student_number")
        email_member = by_email.get(str(email)) if email else None
        student_member = by_student.get(str(student_number)) if student_number else None
        if row.source_system == MEMBER_ROSTER_SOURCE:
            candidates: list[LibraryMember]
            if student_member is not None:
                candidates = [student_member]
            elif student_number:
                candidates = []
            else:
                name = _name_key(row.normalized_payload.get("full_name"))
                candidates = unkeyed_by_name.get(str(name), []) if name else []
            if len(candidates) > 1:
                row.issues.add("existing_unkeyed_roster_name_ambiguous")
                continue
            if len(candidates) == 1:
                member = candidates[0]
                if not _member_matches_confirmed_roster(
                    member,
                    row.normalized_payload,
                ):
                    row.issues.add("existing_confirmed_roster_profile_conflict")
                else:
                    row.normalized_payload["existing_member_id"] = str(
                        member.id
                    )
            continue
        if email_member and student_member and email_member.id != student_member.id:
            row.issues.add("existing_identity_split_conflict")
            continue
        member = email_member or student_member
        if member is None:
            continue
        if member.member_status != "active":
            row.issues.add("existing_member_inactive")
        if email_member is None or member.normalized_email != email:
            row.issues.add("existing_student_number_email_conflict")
        if (
            student_number
            and member.normalized_student_number
            and member.normalized_student_number != student_number
        ):
            row.issues.add("existing_email_student_number_conflict")
        expected_profile = (
            _name_key(row.normalized_payload.get("full_name")),
            row.normalized_payload.get("academic_role"),
            row.normalized_payload.get("faculty_code"),
            row.normalized_payload.get("grade"),
        )
        actual_profile = (
            _name_key(member.full_name),
            member.academic_role,
            member.faculty_code,
            member.grade,
        )
        if expected_profile != actual_profile:
            row.issues.add("existing_member_profile_conflict")
        if identity_emails.get(member.id, {member.normalized_email}) != {
            member.normalized_email
        }:
            row.issues.add("existing_identity_email_conflict")
        row.normalized_payload["existing_member_id"] = str(member.id)

    # Propagate operational conflicts to every linked source row.
    by_linked_email: dict[str, list[_WorkingRow]] = defaultdict(list)
    for row in rows:
        email = row.normalized_payload.get("normalized_email")
        if email and not row.excluded:
            by_linked_email[str(email)].append(row)
    for linked in by_linked_email.values():
        if any(
            any(code.startswith("existing_") for code in row.issues)
            for row in linked
        ):
            for row in linked:
                row.issues.add("linked_record_requires_manual_resolution")


def _report(
    *,
    reference_at: datetime,
    source_hash: str,
    target_drive_resource_fingerprint: str,
    staged_normalized_hash: str,
    raw_snapshot_retention_days: int,
    source_manifest: dict[str, Any],
    rows: list[_WorkingRow],
) -> dict[str, Any]:
    classifications = Counter(row.classification for row in rows)
    issue_counts = Counter(code for row in rows for code in row.issues)
    ready_emails = {
        str(row.normalized_payload["normalized_email"])
        for row in rows
        if row.source_system != "drive_permission"
        and row.classification == READY_CLASSIFICATION
        and row.normalized_payload.get("normalized_email")
    }
    ready_permissions = sum(
        1
        for row in rows
        if row.source_system == "drive_permission"
        and row.classification == READY_CLASSIFICATION
    )
    by_email: dict[str, list[_WorkingRow]] = defaultdict(list)
    unkeyed_rows = 0
    for row in rows:
        if row.excluded:
            continue
        email = row.normalized_payload.get("normalized_email")
        if email:
            by_email[str(email)].append(row)
        else:
            unkeyed_rows += 1
    reconciliation = Counter()
    for linked in by_email.values():
        systems = {row.source_system for row in linked}
        has_drive = "drive_permission" in systems
        has_roster = bool(systems - {"drive_permission"})
        if has_drive and not has_roster:
            reconciliation["drive_only"] += 1
        elif has_roster and not has_drive:
            reconciliation["sheet_only"] += 1
        elif any(row.issues for row in linked):
            reconciliation["mismatch"] += 1
        else:
            reconciliation["both"] += 1
    row_count = len(rows)
    report = {
        "reference_at": reference_at.isoformat(),
        "source_hash": source_hash,
        "target_drive_resource_fingerprint": target_drive_resource_fingerprint,
        "staged_normalized_hash": staged_normalized_hash,
        "raw_snapshot_retention_days": raw_snapshot_retention_days,
        "source_counts": {
            source: source_manifest[source]["row_count"]
            for source in SOURCE_SYSTEMS
            if source in source_manifest
        },
        "row_count": row_count,
        "classification_counts": {
            classification: classifications.get(classification, 0)
            for classification in (
                READY_CLASSIFICATION,
                MANUAL_CLASSIFICATION,
                EXCLUDED_CLASSIFICATION,
            )
        },
        "issue_counts": dict(sorted(issue_counts.items())),
        "ready_member_count": len(ready_emails),
        "ready_member_roster_count": sum(
            1
            for row in rows
            if row.source_system == MEMBER_ROSTER_SOURCE
            and row.classification == READY_CLASSIFICATION
        ),
        "ready_permission_count": ready_permissions,
        "reconciliation_counts": {
            key: reconciliation.get(key, 0)
            for key in ("drive_only", "sheet_only", "both", "mismatch")
        },
        "reconciliation_unique_email_count": len(by_email),
        "reconciliation_unkeyed_row_count": unkeyed_rows,
        "operational_side_effects": False,
    }
    if sum(report["classification_counts"].values()) != row_count:
        raise LegacyImportIntegrityError("classification_count_mismatch")
    return report


def _source_hash(
    *,
    reference_at: datetime,
    schema_version: str,
    normalization_rule_version: str,
    fingerprint_key_version: str,
    target_drive_resource_fingerprint: str,
    raw_snapshot_retention_days: int,
    source_manifest: dict[str, Any],
) -> str:
    return hashlib.sha256(
        _canonical_json(
            {
                "reference_at": reference_at.isoformat(),
                "schema_version": schema_version,
                "normalization_rule_version": normalization_rule_version,
                "fingerprint_key_version": fingerprint_key_version,
                "target_drive_resource_fingerprint": (
                    target_drive_resource_fingerprint
                ),
                "raw_snapshot_retention_days": raw_snapshot_retention_days,
                "source_manifest": source_manifest,
            }
        )
    ).hexdigest()


def _normalized_row_material(
    *,
    source_row_fingerprint: str,
    classification: str,
    normalized_payload: Mapping[str, Any],
    error_codes: Sequence[str],
    resolution_json: Mapping[str, Any],
    legacy_terms_consent_recorded: bool | None,
    legacy_privacy_consent_recorded: bool | None,
    consent_version_provenance: str,
    consent_timestamp_provenance: str,
) -> dict[str, Any]:
    return {
        "source_row_fingerprint": source_row_fingerprint,
        "classification": classification,
        "normalized_payload": dict(normalized_payload),
        "error_codes": sorted(error_codes),
        "resolution_json": dict(resolution_json),
        "legacy_terms_consent_recorded": legacy_terms_consent_recorded,
        "legacy_privacy_consent_recorded": legacy_privacy_consent_recorded,
        "consent_version_provenance": consent_version_provenance,
        "consent_timestamp_provenance": consent_timestamp_provenance,
    }


def _normalized_hash(key: bytes, rows: Sequence[LibraryImportRow]) -> str:
    return _hmac_hex(
        key,
        [
            _normalized_row_material(
                source_row_fingerprint=row.source_row_fingerprint,
                classification=row.classification,
                normalized_payload=row.normalized_payload,
                error_codes=row.error_codes,
                resolution_json=row.resolution_json,
                legacy_terms_consent_recorded=(
                    row.legacy_terms_consent_recorded
                ),
                legacy_privacy_consent_recorded=(
                    row.legacy_privacy_consent_recorded
                ),
                consent_version_provenance=row.consent_version_provenance,
                consent_timestamp_provenance=(
                    row.consent_timestamp_provenance
                ),
            )
            for row in sorted(rows, key=lambda item: item.source_row_fingerprint)
        ],
    )


def stage_legacy_snapshot(
    session: Session,
    *,
    reference_at: datetime,
    sources: Mapping[str, LegacySnapshotSource],
    fingerprint_key: bytes,
    fingerprint_key_version: str,
    drive_resource_id: str,
    expected_drive_resource_fingerprint: str,
    schema_version: str = "legacy-v1",
    normalization_rule_version: str = "phase9-v1",
    raw_snapshot_retention_days: int = DEFAULT_RAW_SNAPSHOT_RETENTION_DAYS,
) -> LegacyImportStageResult:
    _require_fingerprint_key(fingerprint_key)
    reference_at = _utc(reference_at)
    if not _source_systems_are_supported(sources):
        raise ValueError(
            "the required legacy sources and only supported optional sources "
            "must be supplied together"
        )
    if not _clean_text(fingerprint_key_version):
        raise ValueError("fingerprint_key_version is required")
    if not 1 <= raw_snapshot_retention_days <= MAX_RAW_SNAPSHOT_RETENTION_DAYS:
        raise ValueError("raw snapshot retention must be between 1 and 3650 days")
    target_resource_fingerprint = drive_resource_fingerprint(
        fingerprint_key,
        drive_resource_id,
    )
    if (
        not SHA256_PATTERN.fullmatch(expected_drive_resource_fingerprint)
        or not hmac.compare_digest(
            target_resource_fingerprint,
            expected_drive_resource_fingerprint,
        )
    ):
        raise LegacyImportIntegrityError("target_drive_resource_mismatch")

    source_manifest: dict[str, Any] = {}
    working_rows: list[_WorkingRow] = []
    for source_system in SOURCE_SYSTEMS:
        if source_system not in sources:
            continue
        source = sources[source_system]
        source_manifest[source_system] = {
            "content_sha256": hashlib.sha256(source.snapshot_bytes).hexdigest(),
            "row_count": len(source.rows),
        }
        seen_row_numbers: set[int] = set()
        for source_row in source.rows:
            if source_row.source_row_number in seen_row_numbers:
                raise ValueError("duplicate source row number within source")
            seen_row_numbers.add(source_row.source_row_number)
            working_rows.append(_normalize_source_row(source_system, source_row))

    snapshot_hash = _source_hash(
        reference_at=reference_at,
        schema_version=schema_version,
        normalization_rule_version=normalization_rule_version,
        fingerprint_key_version=fingerprint_key_version,
        target_drive_resource_fingerprint=target_resource_fingerprint,
        raw_snapshot_retention_days=raw_snapshot_retention_days,
        source_manifest=source_manifest,
    )
    existing = session.scalar(
        select(LibraryImportBatch).where(
            LibraryImportBatch.source_hash == snapshot_hash
        )
    )
    if existing is not None:
        return LegacyImportStageResult(
            batch_id=existing.id,
            status=existing.status,
            replayed=True,
            report=deepcopy(existing.dry_run_report_json),
        )

    _mark_duplicates(working_rows)
    _mark_cross_source_conflicts(working_rows)
    _mark_operational_conflicts(session, working_rows)
    prepared_rows: list[tuple[_WorkingRow, str, str, dict[str, Any]]] = []
    for working in working_rows:
        raw_payload_hash = _hmac_hex(fingerprint_key, working.source_payload)
        row_fingerprint = _source_row_fingerprint(
            fingerprint_key,
            source_system=working.source_system,
            source_row_number=working.source_row_number,
            raw_payload_hash=raw_payload_hash,
        )
        if working.source_system in {
            "drive_permission",
            MEMBER_ROSTER_SOURCE,
        }:
            terms_recorded = None
            privacy_recorded = None
            version_provenance = "not_applicable"
            timestamp_provenance = "not_applicable"
        else:
            terms_recorded = bool(
                working.normalized_payload.get("terms_accepted")
            )
            privacy_recorded = bool(
                working.normalized_payload.get("privacy_accepted")
            )
            version_provenance = "legacy_unknown"
            timestamp_provenance = "legacy_unknown"
        normalized_material = _normalized_row_material(
            source_row_fingerprint=row_fingerprint,
            classification=working.classification,
            normalized_payload=working.normalized_payload,
            error_codes=sorted(working.issues),
            resolution_json={},
            legacy_terms_consent_recorded=terms_recorded,
            legacy_privacy_consent_recorded=privacy_recorded,
            consent_version_provenance=version_provenance,
            consent_timestamp_provenance=timestamp_provenance,
        )
        prepared_rows.append(
            (working, raw_payload_hash, row_fingerprint, normalized_material)
        )
    staged_normalized_hash = _hmac_hex(
        fingerprint_key,
        [
            material
            for _working, _raw_hash, _fingerprint, material in sorted(
                prepared_rows,
                key=lambda item: item[2],
            )
        ],
    )
    report = _report(
        reference_at=reference_at,
        source_hash=snapshot_hash,
        target_drive_resource_fingerprint=target_resource_fingerprint,
        staged_normalized_hash=staged_normalized_hash,
        raw_snapshot_retention_days=raw_snapshot_retention_days,
        source_manifest=source_manifest,
        rows=working_rows,
    )
    dry_run_hash = _hmac_hex(fingerprint_key, report)
    batch = LibraryImportBatch(
        source_type="legacy_snapshot",
        source_hash=snapshot_hash,
        schema_version=schema_version,
        normalization_rule_version=normalization_rule_version,
        fingerprint_key_version=fingerprint_key_version,
        target_drive_resource_fingerprint=target_resource_fingerprint,
        reference_at=reference_at,
        source_manifest_json=source_manifest,
        dry_run_report_json=report,
        dry_run_hash=dry_run_hash,
        staged_normalized_hash=staged_normalized_hash,
        raw_snapshot_expires_at=reference_at
        + timedelta(days=raw_snapshot_retention_days),
        status="validated",
        row_count=len(working_rows),
    )
    session.add(batch)
    session.flush()
    for working, raw_payload_hash, row_fingerprint, material in prepared_rows:
        session.add(
            LibraryImportRow(
                batch_id=batch.id,
                source_system=working.source_system,
                source_row_number=working.source_row_number,
                source_row_fingerprint=row_fingerprint,
                raw_payload_hash=raw_payload_hash,
                fingerprint_key_version=fingerprint_key_version,
                normalization_rule_version=normalization_rule_version,
                classification=working.classification,
                source_payload=working.source_payload,
                normalized_payload=working.normalized_payload,
                normalized_payload_hash=_hmac_hex(fingerprint_key, material),
                legacy_terms_consent_recorded=material[
                    "legacy_terms_consent_recorded"
                ],
                legacy_privacy_consent_recorded=material[
                    "legacy_privacy_consent_recorded"
                ],
                consent_version_provenance=material[
                    "consent_version_provenance"
                ],
                consent_timestamp_provenance=material[
                    "consent_timestamp_provenance"
                ],
                error_codes=sorted(working.issues),
                resolution_json={},
                apply_status="pending",
            )
        )
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        replay = session.scalar(
            select(LibraryImportBatch).where(
                LibraryImportBatch.source_hash == snapshot_hash
            )
        )
        if replay is None:
            raise LegacyImportConflictError("snapshot_stage_conflict") from error
        return LegacyImportStageResult(
            batch_id=replay.id,
            status=replay.status,
            replayed=True,
            report=deepcopy(replay.dry_run_report_json),
        )
    return LegacyImportStageResult(
        batch_id=batch.id,
        status=batch.status,
        replayed=False,
        report=deepcopy(report),
    )


def _load_batch_for_update(session: Session, batch_id: UUID) -> LibraryImportBatch:
    batch = session.scalar(
        select(LibraryImportBatch)
        .where(LibraryImportBatch.id == batch_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if batch is None:
        raise LegacyImportStateError("legacy_import_batch_not_found")
    return batch


def _require_active_admin(session: Session, admin_id: UUID) -> LibraryAdmin:
    admin = session.get(LibraryAdmin, admin_id)
    if admin is None or not admin.active or admin.role != "admin":
        raise LegacyImportStateError("active_admin_approval_required")
    return admin


def _reason(value: str) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) < 10 or len(cleaned) > 500:
        raise ValueError("legacy import reason must be 10 to 500 characters")
    return cleaned


def _idempotency_key(value: str) -> str:
    cleaned = value.strip()
    if not 8 <= len(cleaned) <= 128:
        raise ValueError("legacy import idempotency key must be 8 to 128 characters")
    return cleaned


def _audit_action_key(action_scope: str) -> str:
    return hashlib.sha256(action_scope.encode("utf-8")).hexdigest()


def _phase9_audit(
    session: Session,
    admin: LibraryAdmin,
    batch: LibraryImportBatch,
    *,
    action: str,
    action_scope: str,
    reason: str,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    action_key = _audit_action_key(action_scope)
    session.add(
        LibraryAdminAudit(
            admin_id=admin.id,
            action=action,
            action_key=action_key,
            actor_role=admin.role,
            result="accepted",
            request_id=f"phase9-private-{action_key[:32]}",
            reason=reason,
            metadata_json={
                "batch_id": str(batch.id),
                "source_hash": batch.source_hash,
                "dry_run_hash": batch.dry_run_hash,
                "row_count": batch.row_count,
                "record_version_before_commit": batch.record_version,
                "operational_side_effects": False,
                **dict(metadata or {}),
            },
        )
    )


def _verify_batch_integrity(
    batch: LibraryImportBatch,
    *,
    fingerprint_key: bytes,
) -> None:
    _require_fingerprint_key(fingerprint_key)
    if batch.raw_purged_at is not None:
        raise LegacyImportIntegrityError("legacy_import_raw_snapshot_purged")
    retention_days = batch.dry_run_report_json.get(
        "raw_snapshot_retention_days"
    )
    if (
        not isinstance(retention_days, int)
        or not 1 <= retention_days <= MAX_RAW_SNAPSHOT_RETENTION_DAYS
        or batch.raw_snapshot_expires_at is None
        or _stored_utc(batch.raw_snapshot_expires_at)
        != _stored_utc(batch.reference_at) + timedelta(days=retention_days)
    ):
        raise LegacyImportIntegrityError("legacy_import_retention_mismatch")
    if not SHA256_PATTERN.fullmatch(
        batch.target_drive_resource_fingerprint
    ):
        raise LegacyImportIntegrityError("target_drive_resource_mismatch")
    expected_source_hash = _source_hash(
        reference_at=_stored_utc(batch.reference_at),
        schema_version=batch.schema_version,
        normalization_rule_version=batch.normalization_rule_version,
        fingerprint_key_version=batch.fingerprint_key_version,
        target_drive_resource_fingerprint=(
            batch.target_drive_resource_fingerprint
        ),
        raw_snapshot_retention_days=retention_days,
        source_manifest=batch.source_manifest_json,
    )
    if not hmac.compare_digest(expected_source_hash, batch.source_hash):
        raise LegacyImportIntegrityError("legacy_import_source_hash_mismatch")
    if len(batch.rows) != batch.row_count:
        raise LegacyImportIntegrityError("legacy_import_row_count_mismatch")
    if not _source_systems_are_supported(batch.source_manifest_json):
        raise LegacyImportIntegrityError("legacy_import_source_manifest_mismatch")
    actual_source_counts = Counter(row.source_system for row in batch.rows)
    for source_system in SOURCE_SYSTEMS:
        if source_system not in batch.source_manifest_json:
            continue
        manifest_entry = batch.source_manifest_json[source_system]
        if (
            manifest_entry.get("row_count") != actual_source_counts[source_system]
            or not SHA256_PATTERN.fullmatch(
                str(manifest_entry.get("content_sha256", ""))
            )
        ):
            raise LegacyImportIntegrityError(
                "legacy_import_source_manifest_mismatch"
            )
    for row in batch.rows:
        if (
            row.fingerprint_key_version != batch.fingerprint_key_version
            or row.normalization_rule_version
            != batch.normalization_rule_version
        ):
            raise LegacyImportIntegrityError("legacy_import_rule_version_mismatch")
        raw_payload_hash = _hmac_hex(fingerprint_key, row.source_payload)
        if not hmac.compare_digest(raw_payload_hash, row.raw_payload_hash):
            raise LegacyImportIntegrityError("legacy_import_raw_payload_mismatch")
        fingerprint = _source_row_fingerprint(
            fingerprint_key,
            source_system=row.source_system,
            source_row_number=row.source_row_number,
            raw_payload_hash=raw_payload_hash,
        )
        if not hmac.compare_digest(fingerprint, row.source_row_fingerprint):
            raise LegacyImportIntegrityError("legacy_import_row_fingerprint_mismatch")
        normalized_material = _normalized_row_material(
            source_row_fingerprint=row.source_row_fingerprint,
            classification=row.classification,
            normalized_payload=row.normalized_payload,
            error_codes=row.error_codes,
            resolution_json=row.resolution_json,
            legacy_terms_consent_recorded=(
                row.legacy_terms_consent_recorded
            ),
            legacy_privacy_consent_recorded=(
                row.legacy_privacy_consent_recorded
            ),
            consent_version_provenance=row.consent_version_provenance,
            consent_timestamp_provenance=(
                row.consent_timestamp_provenance
            ),
        )
        if not hmac.compare_digest(
            _hmac_hex(fingerprint_key, normalized_material),
            row.normalized_payload_hash,
        ):
            raise LegacyImportIntegrityError(
                "legacy_import_normalized_row_mismatch"
            )
    current_normalized_hash = _normalized_hash(fingerprint_key, batch.rows)
    if not hmac.compare_digest(
        current_normalized_hash,
        batch.staged_normalized_hash,
    ):
        raise LegacyImportIntegrityError(
            "legacy_import_staged_normalized_hash_mismatch"
        )
    if (
        batch.dry_run_report_json.get("staged_normalized_hash")
        != batch.staged_normalized_hash
        or batch.dry_run_report_json.get(
            "target_drive_resource_fingerprint"
        )
        != batch.target_drive_resource_fingerprint
    ):
        raise LegacyImportIntegrityError("legacy_import_report_lineage_mismatch")
    if not hmac.compare_digest(
        _hmac_hex(fingerprint_key, batch.dry_run_report_json),
        batch.dry_run_hash or "",
    ):
        raise LegacyImportIntegrityError("legacy_import_report_hash_mismatch")


def approve_legacy_import(
    session: Session,
    batch_id: UUID,
    *,
    approved_by_admin_id: UUID,
    reason: str,
    idempotency_key: str,
    fingerprint_key: bytes,
) -> LegacyImportApprovalResult:
    admin = _require_active_admin(session, approved_by_admin_id)
    reason = _reason(reason)
    idempotency_key = _idempotency_key(idempotency_key)
    action_key = hashlib.sha256(
        f"legacy-import-approve:{batch_id}:{idempotency_key}".encode()
    ).hexdigest()
    batch = _load_batch_for_update(session, batch_id)
    if batch.approval_key == action_key:
        if (
            batch.approved_by_admin_id != approved_by_admin_id
            or batch.approval_reason != reason
        ):
            raise LegacyImportConflictError("approval_idempotency_payload_mismatch")
        return LegacyImportApprovalResult(
            batch_id=batch.id,
            status=batch.status,
            replayed=True,
            record_version=batch.record_version,
        )
    if batch.status not in {"validated", "rolled_back"}:
        raise LegacyImportStateError("legacy_import_batch_not_approvable")
    _verify_batch_integrity(batch, fingerprint_key=fingerprint_key)
    batch.status = "approved"
    batch.approved_at = datetime.now(UTC)
    batch.approved_by_admin_id = approved_by_admin_id
    batch.approved_source_hash = batch.source_hash
    batch.approved_normalized_hash = batch.staged_normalized_hash
    batch.approval_key = action_key
    batch.approval_reason = reason
    _phase9_audit(
        session,
        admin,
        batch,
        action="legacy_import_approved",
        action_scope=f"legacy-import-approve-audit:{action_key}",
        reason=reason,
        metadata={
            "approved_source_hash": batch.approved_source_hash or "",
            "approved_normalized_hash": batch.approved_normalized_hash or "",
            "target_drive_resource_fingerprint": (
                batch.target_drive_resource_fingerprint
            ),
        },
    )
    session.commit()
    return LegacyImportApprovalResult(
        batch_id=batch.id,
        status=batch.status,
        replayed=False,
        record_version=batch.record_version,
    )


def reject_legacy_import(
    session: Session,
    batch_id: UUID,
    *,
    rejected_by_admin_id: UUID,
    reason: str,
) -> LibraryImportBatch:
    admin = _require_active_admin(session, rejected_by_admin_id)
    batch = _load_batch_for_update(session, batch_id)
    if batch.status == "rejected":
        return batch
    if batch.status not in {"staged", "validated", "approved"}:
        raise LegacyImportStateError("legacy_import_batch_not_rejectable")
    batch.status = "rejected"
    batch.rejected_at = datetime.now(UTC)
    batch.rejected_by_admin_id = rejected_by_admin_id
    batch.rejection_reason = _reason(reason)
    _phase9_audit(
        session,
        admin,
        batch,
        action="legacy_import_rejected",
        action_scope=f"legacy-import-reject-audit:{batch.id}",
        reason=batch.rejection_reason,
    )
    session.commit()
    return batch


def _member_payload(member: LibraryMember) -> dict[str, Any]:
    return {
        "id": str(member.id),
        "normalized_email": member.normalized_email,
        "normalized_student_number": member.normalized_student_number,
        "full_name": member.full_name,
        "academic_role": member.academic_role,
        "faculty_code": member.faculty_code,
        "grade": member.grade,
        "registered_at_utc": (
            _stored_utc(member.registered_at).isoformat()
            if member.registered_at is not None
            else None
        ),
        "member_status": member.member_status,
        "record_version": member.record_version,
    }


def _grant_payload(grant: LibraryAccessGrant) -> dict[str, Any]:
    return {
        "id": str(grant.id),
        "member_id": str(grant.member_id),
        "resource_id": grant.resource_id,
        "permission_id": grant.permission_id,
        "role": grant.role,
        "status": grant.status,
        "managed_by_system": grant.managed_by_system,
        "notification_status": grant.notification_status,
    }


def _assert_member_matches(member: LibraryMember, payload: Mapping[str, Any]) -> None:
    expected = (
        payload.get("normalized_email"),
        payload.get("normalized_student_number"),
        _name_key(payload.get("full_name")),
        payload.get("academic_role"),
        payload.get("faculty_code"),
        payload.get("grade"),
    )
    actual = (
        member.normalized_email,
        member.normalized_student_number,
        _name_key(member.full_name),
        member.academic_role,
        member.faculty_code,
        member.grade,
    )
    if expected != actual or member.member_status != "active":
        raise LegacyImportConflictError("operational_member_changed_since_dry_run")


def _member_matches_confirmed_roster(
    member: LibraryMember,
    payload: Mapping[str, Any],
) -> bool:
    return (
        member.member_status == "active"
        and _name_key(member.full_name) == _name_key(payload.get("full_name"))
        and member.normalized_student_number
        == payload.get("normalized_student_number")
        and roster_grade_label(member.academic_role, member.grade)
        == payload.get("roster_grade")
    )


def _prior_member_for_roster_row(
    session: Session,
    row: LibraryImportRow,
) -> LibraryMember | None:
    prior = session.scalar(
        select(LibraryImportRow)
        .where(
            LibraryImportRow.source_system == MEMBER_ROSTER_SOURCE,
            LibraryImportRow.source_row_fingerprint
            == row.source_row_fingerprint,
            LibraryImportRow.apply_status == "applied",
            LibraryImportRow.applied_member_id.is_not(None),
            LibraryImportRow.id != row.id,
        )
        .order_by(LibraryImportRow.created_at.desc())
        .limit(1)
    )
    if prior is None or prior.applied_member_id is None:
        return None
    return session.scalar(
        select(LibraryMember)
        .where(LibraryMember.id == prior.applied_member_id)
        .with_for_update()
    )


def apply_legacy_import(
    session: Session,
    batch_id: UUID,
    *,
    drive_resource_id: str,
    fingerprint_key: bytes,
) -> LegacyImportApplyResult:
    batch = _load_batch_for_update(session, batch_id)
    supplied_resource_fingerprint = drive_resource_fingerprint(
        fingerprint_key,
        drive_resource_id,
    )
    if not hmac.compare_digest(
        supplied_resource_fingerprint,
        batch.target_drive_resource_fingerprint,
    ):
        raise LegacyImportIntegrityError("target_drive_resource_mismatch")
    if batch.status == "applied":
        return LegacyImportApplyResult(
            batch_id=batch.id,
            status=batch.status,
            replayed=True,
            created_members=sum(
                1 for row in batch.rows if row.member_created_by_batch
            ),
            reused_members=0,
            created_access_grants=sum(
                1 for row in batch.rows if row.access_grant_created_by_batch
            ),
            reused_access_grants=0,
            skipped_rows=sum(
                1 for row in batch.rows if row.apply_status == "skipped"
            ),
        )
    if batch.status != "approved":
        raise LegacyImportStateError("legacy_import_batch_not_approved")
    if batch.approved_by_admin_id is None or not batch.approval_key:
        raise LegacyImportIntegrityError("legacy_import_approval_lineage_missing")
    approving_admin = _require_active_admin(
        session,
        batch.approved_by_admin_id,
    )
    _verify_batch_integrity(batch, fingerprint_key=fingerprint_key)
    if batch.approved_source_hash != batch.source_hash:
        raise LegacyImportIntegrityError("approved_source_hash_mismatch")
    normalized_hash = _normalized_hash(fingerprint_key, batch.rows)
    if not hmac.compare_digest(
        normalized_hash,
        batch.approved_normalized_hash or "",
    ):
        raise LegacyImportIntegrityError("approved_normalized_hash_mismatch")

    ready_roster: dict[str, list[LibraryImportRow]] = defaultdict(list)
    ready_drive: dict[str, list[LibraryImportRow]] = defaultdict(list)
    ready_member_roster: list[LibraryImportRow] = []
    for row in batch.rows:
        if row.classification != READY_CLASSIFICATION:
            row.apply_status = "skipped"
            continue
        if row.source_system == MEMBER_ROSTER_SOURCE:
            ready_member_roster.append(row)
            continue
        email = row.normalized_payload.get("normalized_email")
        if not email or not _is_allowed_workspace_email(str(email)):
            raise LegacyImportIntegrityError("ready_row_email_domain_not_allowed")
        if row.source_system == "drive_permission":
            ready_drive[str(email)].append(row)
        else:
            ready_roster[str(email)].append(row)

    created_members = 0
    reused_members = 0
    created_grants = 0
    reused_grants = 0
    try:
        for email, roster_rows in sorted(ready_roster.items()):
            if email not in ready_drive or len(ready_drive[email]) != 1:
                raise LegacyImportIntegrityError("ready_member_permission_mismatch")
            canonical = sorted(
                roster_rows,
                key=lambda row: (row.source_system != "management_sheet", row.id.hex),
            )[0].normalized_payload
            registration_times = [
                datetime.fromisoformat(str(row.normalized_payload["registered_at_utc"]))
                for row in roster_rows
                if row.normalized_payload.get("registered_at_utc")
            ]
            registered_at = min(registration_times) if registration_times else None
            member_by_email = session.scalar(
                select(LibraryMember)
                .where(LibraryMember.normalized_email == email)
                .with_for_update()
            )
            student_number = canonical.get("normalized_student_number")
            member_by_student = None
            if student_number:
                member_by_student = session.scalar(
                    select(LibraryMember)
                    .where(
                        LibraryMember.normalized_student_number == student_number
                    )
                    .with_for_update()
                )
            if (
                member_by_email
                and member_by_student
                and member_by_email.id != member_by_student.id
            ):
                raise LegacyImportConflictError("operational_identity_split_conflict")
            member = member_by_email or member_by_student
            member_created = False
            if member is None:
                member = LibraryMember(
                    normalized_email=email,
                    normalized_student_number=student_number,
                    full_name=str(canonical["full_name"]),
                    academic_role=str(canonical["academic_role"]),
                    faculty_code=str(canonical["faculty_code"]),
                    grade=(str(canonical["grade"]) if canonical.get("grade") else None),
                    registered_at=registered_at,
                    member_status="active",
                )
                session.add(member)
                session.flush()
                member_created = True
                created_members += 1
            else:
                _assert_member_matches(member, canonical)
                reused_members += 1

            member_snapshot_hash = _hmac_hex(
                fingerprint_key,
                _member_payload(member),
            )
            for row in roster_rows:
                row.apply_status = "applied"
                row.applied_member_id = member.id
                row.member_created_by_batch = False
                row.applied_member_snapshot_hash = member_snapshot_hash
            if member_created:
                roster_rows[0].member_created_by_batch = True

            permission_row = ready_drive[email][0]
            permission_id = str(
                permission_row.normalized_payload["permission_id"]
            )
            permission_role = str(
                permission_row.normalized_payload["permission_role"]
            )
            grant_by_permission = session.scalar(
                select(LibraryAccessGrant)
                .where(LibraryAccessGrant.permission_id == permission_id)
                .with_for_update()
            )
            grant_by_resource = session.scalar(
                select(LibraryAccessGrant)
                .where(
                    LibraryAccessGrant.member_id == member.id,
                    LibraryAccessGrant.resource_id == drive_resource_id,
                )
                .with_for_update()
            )
            if (
                grant_by_permission
                and grant_by_resource
                and grant_by_permission.id != grant_by_resource.id
            ):
                raise LegacyImportConflictError("operational_permission_split_conflict")
            grant = grant_by_permission or grant_by_resource
            grant_created = False
            if grant is None:
                grant = LibraryAccessGrant(
                    member_id=member.id,
                    resource_id=drive_resource_id,
                    target_alias=DRIVE_TARGET_ALIAS,
                    permission_id=permission_id,
                    role=permission_role,
                    status="already_granted",
                    managed_by_system=False,
                    notification_status="not_applicable",
                    granted_at=batch.reference_at,
                )
                session.add(grant)
                session.flush()
                grant_created = True
                created_grants += 1
            else:
                if (
                    grant.member_id != member.id
                    or grant.resource_id != drive_resource_id
                    or grant.target_alias not in (None, DRIVE_TARGET_ALIAS)
                    or grant.permission_id != permission_id
                    or grant.role != permission_role
                    or grant.managed_by_system
                    or grant.status not in {"granted", "already_granted"}
                ):
                    raise LegacyImportConflictError(
                        "operational_permission_changed_since_dry_run"
                    )
                grant.target_alias = DRIVE_TARGET_ALIAS
                reused_grants += 1
            grant_snapshot_hash = _hmac_hex(
                fingerprint_key,
                _grant_payload(grant),
            )
            permission_row.apply_status = "applied"
            permission_row.applied_member_id = member.id
            permission_row.applied_access_grant_id = grant.id
            permission_row.access_grant_created_by_batch = grant_created
            permission_row.applied_member_snapshot_hash = member_snapshot_hash
            permission_row.applied_access_grant_snapshot_hash = grant_snapshot_hash

        for roster_row in sorted(
            ready_member_roster,
            key=lambda row: (row.source_row_number, row.id.hex),
        ):
            canonical = roster_row.normalized_payload
            student_number = canonical.get("normalized_student_number")
            prior_member = _prior_member_for_roster_row(session, roster_row)
            student_member = None
            if student_number:
                student_member = session.scalar(
                    select(LibraryMember)
                    .where(
                        LibraryMember.normalized_student_number
                        == student_number
                    )
                    .with_for_update()
                )
            if (
                prior_member is not None
                and student_member is not None
                and prior_member.id != student_member.id
            ):
                raise LegacyImportConflictError(
                    "confirmed_roster_member_split_conflict"
                )
            member = prior_member or student_member
            if member is None and not student_number:
                unkeyed_candidates = list(
                    session.scalars(
                        select(LibraryMember)
                        .where(
                            LibraryMember.normalized_student_number.is_(None),
                            LibraryMember.member_status == "active",
                        )
                        .with_for_update()
                    )
                )
                named_candidates = [
                    candidate
                    for candidate in unkeyed_candidates
                    if _name_key(candidate.full_name)
                    == _name_key(canonical.get("full_name"))
                ]
                if len(named_candidates) > 1:
                    raise LegacyImportConflictError(
                        "confirmed_roster_unkeyed_name_conflict"
                    )
                member = named_candidates[0] if named_candidates else None

            member_created = False
            if member is None:
                registered_at = (
                    datetime.fromisoformat(
                        str(canonical["registered_at_utc"])
                    )
                    if canonical.get("registered_at_utc")
                    else None
                )
                member = LibraryMember(
                    normalized_email=None,
                    normalized_student_number=(
                        str(student_number) if student_number else None
                    ),
                    full_name=str(canonical["full_name"]),
                    academic_role=str(canonical["academic_role"]),
                    faculty_code=str(canonical["faculty_code"]),
                    grade=(
                        str(canonical["grade"])
                        if canonical.get("grade")
                        else None
                    ),
                    registered_at=registered_at,
                    member_status="active",
                )
                session.add(member)
                session.flush()
                member_created = True
                created_members += 1
            else:
                created_by_current_batch = any(
                    linked_row.applied_member_id == member.id
                    and linked_row.member_created_by_batch
                    for linked_row in batch.rows
                )
                if created_by_current_batch:
                    member.full_name = str(canonical["full_name"])
                    if canonical.get("academic_role") != "legacy_other":
                        member.academic_role = str(canonical["academic_role"])
                        member.grade = (
                            str(canonical["grade"])
                            if canonical.get("grade")
                            else None
                        )
                elif not _member_matches_confirmed_roster(member, canonical):
                    raise LegacyImportConflictError(
                        "confirmed_roster_member_changed"
                    )
                reused_members += 1

            roster_row.apply_status = "applied"
            roster_row.applied_member_id = member.id
            roster_row.member_created_by_batch = member_created
            session.flush()
            member_snapshot_hash = _hmac_hex(
                fingerprint_key,
                _member_payload(member),
            )
            for linked_row in batch.rows:
                if linked_row.applied_member_id == member.id:
                    linked_row.applied_member_snapshot_hash = member_snapshot_hash

        batch.status = "applied"
        batch.applied_at = datetime.now(UTC)
        batch.rolled_back_at = None
        batch.rolled_back_by_admin_id = None
        batch.rollback_reason = None
        _phase9_audit(
            session,
            approving_admin,
            batch,
            action="legacy_import_applied",
            action_scope=(
                f"legacy-import-apply-audit:{batch.id}:{batch.approval_key}"
            ),
            reason=batch.approval_reason or "Approved Phase 9 migration apply.",
            metadata={
                "created_members": created_members,
                "reused_members": reused_members,
                "created_access_grants": created_grants,
                "reused_access_grants": reused_grants,
                "target_drive_resource_fingerprint": (
                    batch.target_drive_resource_fingerprint
                ),
            },
        )
        session.commit()
    except (IntegrityError, LegacyImportError) as error:
        session.rollback()
        if isinstance(error, LegacyImportError):
            raise
        raise LegacyImportConflictError("legacy_import_apply_conflict") from error

    return LegacyImportApplyResult(
        batch_id=batch.id,
        status=batch.status,
        replayed=False,
        created_members=created_members,
        reused_members=reused_members,
        created_access_grants=created_grants,
        reused_access_grants=reused_grants,
        skipped_rows=sum(
            1 for row in batch.rows if row.apply_status == "skipped"
        ),
    )


def rollback_legacy_import(
    session: Session,
    batch_id: UUID,
    *,
    rolled_back_by_admin_id: UUID,
    reason: str,
    fingerprint_key: bytes,
) -> LegacyImportRollbackResult:
    admin = _require_active_admin(session, rolled_back_by_admin_id)
    reason = _reason(reason)
    batch = _load_batch_for_update(session, batch_id)
    if batch.status == "rolled_back":
        return LegacyImportRollbackResult(
            batch_id=batch.id,
            status=batch.status,
            replayed=True,
            deleted_members=0,
            deleted_access_grants=0,
        )
    if batch.status != "applied":
        raise LegacyImportStateError("legacy_import_batch_not_applied")

    created_grant_rows = {
        row.applied_access_grant_id: row
        for row in batch.rows
        if row.access_grant_created_by_batch and row.applied_access_grant_id
    }
    created_member_rows = {
        row.applied_member_id: row
        for row in batch.rows
        if row.member_created_by_batch and row.applied_member_id
    }
    try:
        for grant_id, row in created_grant_rows.items():
            grant = session.scalar(
                select(LibraryAccessGrant)
                .where(LibraryAccessGrant.id == grant_id)
                .with_for_update()
            )
            if grant is None or grant.managed_by_system:
                raise LegacyImportConflictError("imported_grant_changed")
            current_hash = _hmac_hex(fingerprint_key, _grant_payload(grant))
            if not hmac.compare_digest(
                current_hash,
                row.applied_access_grant_snapshot_hash or "",
            ):
                raise LegacyImportConflictError("imported_grant_changed")

        for member_id, row in created_member_rows.items():
            member = session.scalar(
                select(LibraryMember)
                .where(LibraryMember.id == member_id)
                .with_for_update()
            )
            if member is None:
                raise LegacyImportConflictError("imported_member_changed")
            current_hash = _hmac_hex(fingerprint_key, _member_payload(member))
            if not hmac.compare_digest(
                current_hash,
                row.applied_member_snapshot_hash or "",
            ):
                raise LegacyImportConflictError("imported_member_changed")
            if session.scalar(
                select(LibraryApplication.id).where(
                    LibraryApplication.member_id == member_id
                ).limit(1)
            ) is not None or session.scalar(
                select(LibraryIdentity.id).where(
                    LibraryIdentity.member_id == member_id
                ).limit(1)
            ) is not None or session.scalar(
                select(LibraryOperation.id).where(
                    LibraryOperation.member_id == member_id
                ).limit(1)
            ) is not None:
                raise LegacyImportConflictError("imported_member_has_dependents")
            grants = set(
                session.scalars(
                    select(LibraryAccessGrant.id).where(
                        LibraryAccessGrant.member_id == member_id
                    )
                )
            )
            expected_grants = set(created_grant_rows)
            if not grants.issubset(expected_grants):
                raise LegacyImportConflictError("imported_member_has_new_grant")

        for grant_id in created_grant_rows:
            session.delete(session.get(LibraryAccessGrant, grant_id))
        session.flush()
        for member_id in created_member_rows:
            session.delete(session.get(LibraryMember, member_id))
        for row in batch.rows:
            if row.apply_status in {"applied", "skipped"}:
                row.apply_status = "rolled_back"
        batch.status = "rolled_back"
        batch.rolled_back_at = datetime.now(UTC)
        batch.rolled_back_by_admin_id = rolled_back_by_admin_id
        batch.rollback_reason = reason
        _phase9_audit(
            session,
            admin,
            batch,
            action="legacy_import_rolled_back",
            action_scope=(
                f"legacy-import-rollback-audit:{batch.id}:{batch.approval_key}"
            ),
            reason=reason,
            metadata={
                "deleted_members": len(created_member_rows),
                "deleted_access_grants": len(created_grant_rows),
            },
        )
        session.commit()
    except LegacyImportError:
        session.rollback()
        raise

    return LegacyImportRollbackResult(
        batch_id=batch.id,
        status=batch.status,
        replayed=False,
        deleted_members=len(created_member_rows),
        deleted_access_grants=len(created_grant_rows),
    )


def set_legacy_import_legal_hold(
    session: Session,
    batch_id: UUID,
    *,
    admin_id: UUID,
    enabled: bool,
    reason: str,
    idempotency_key: str,
) -> LegacyImportHoldResult:
    admin = _require_active_admin(session, admin_id)
    reason = _reason(reason)
    idempotency_key = _idempotency_key(idempotency_key)
    batch = _load_batch_for_update(session, batch_id)
    if batch.raw_purged_at is not None:
        raise LegacyImportStateError("legacy_import_raw_snapshot_already_purged")
    action_scope = (
        f"legacy-import-legal-hold:{batch.id}:{enabled}:{idempotency_key}"
    )
    action_key = _audit_action_key(action_scope)
    existing = session.scalar(
        select(LibraryAdminAudit).where(
            LibraryAdminAudit.action_key == action_key
        )
    )
    if existing is not None:
        if (
            existing.admin_id != admin.id
            or existing.reason != reason
            or (existing.metadata_json or {}).get("legal_hold") is not enabled
        ):
            raise LegacyImportConflictError(
                "legal_hold_idempotency_payload_mismatch"
            )
        return LegacyImportHoldResult(
            batch_id=batch.id,
            legal_hold=batch.legal_hold,
            replayed=True,
            record_version=batch.record_version,
        )
    batch.legal_hold = enabled
    _phase9_audit(
        session,
        admin,
        batch,
        action=(
            "legacy_import_legal_hold_enabled"
            if enabled
            else "legacy_import_legal_hold_disabled"
        ),
        action_scope=action_scope,
        reason=reason,
        metadata={"legal_hold": enabled},
    )
    session.commit()
    return LegacyImportHoldResult(
        batch_id=batch.id,
        legal_hold=batch.legal_hold,
        replayed=False,
        record_version=batch.record_version,
    )


def purge_expired_legacy_snapshots(
    session: Session,
    *,
    now: datetime,
    admin_id: UUID,
    reason: str,
    idempotency_key: str,
) -> int:
    now = _utc(now)
    admin = _require_active_admin(session, admin_id)
    reason = _reason(reason)
    idempotency_key = _idempotency_key(idempotency_key)
    batches = list(
        session.scalars(
            select(LibraryImportBatch).where(
                LibraryImportBatch.status.in_(
                    {"applied", "rolled_back", "rejected"}
                ),
                LibraryImportBatch.legal_hold.is_(False),
                LibraryImportBatch.raw_purged_at.is_(None),
                LibraryImportBatch.raw_snapshot_expires_at.is_not(None),
                LibraryImportBatch.raw_snapshot_expires_at <= now,
            ).with_for_update()
        )
    )
    for batch in batches:
        action_scope = (
            f"legacy-import-purge:{batch.id}:{idempotency_key}"
        )
        action_key = _audit_action_key(action_scope)
        existing = session.scalar(
            select(LibraryAdminAudit).where(
                LibraryAdminAudit.action_key == action_key
            )
        )
        if existing is not None:
            if existing.admin_id != admin.id or existing.reason != reason:
                raise LegacyImportConflictError(
                    "purge_idempotency_payload_mismatch"
                )
            raise LegacyImportIntegrityError(
                "purge_audit_exists_without_redaction"
            )
        batch.raw_purged_at = now
    session.flush()
    for batch in batches:
        for row in batch.rows:
            row._allow_source_payload_redaction = True
            row.source_payload = {}
            row.normalized_payload = {}
            row.error_codes = []
            row.resolution_json = {}
        _phase9_audit(
            session,
            admin,
            batch,
            action="legacy_import_raw_snapshot_purged",
            action_scope=(
                f"legacy-import-purge:{batch.id}:{idempotency_key}"
            ),
            reason=reason,
            metadata={
                "raw_snapshot_expires_at": (
                    _stored_utc(batch.raw_snapshot_expires_at).isoformat()
                    if batch.raw_snapshot_expires_at
                    else None
                ),
                "raw_purged_at": now.isoformat(),
                "legal_hold": False,
                "durable_consent_provenance_retained": True,
            },
        )
    session.commit()
    return len(batches)
