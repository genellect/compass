from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hashlib
import json
from uuid import uuid4

import pytest
from sqlalchemy import func, select
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
from app.legacy_import import (
    LegacyImportConflictError,
    LegacyImportIntegrityError,
    LegacyImportStateError,
    LegacySnapshotSource,
    LegacySourceRow,
    apply_legacy_import,
    approve_legacy_import,
    drive_resource_fingerprint,
    purge_expired_legacy_snapshots,
    reject_legacy_import,
    rollback_legacy_import,
    set_legacy_import_legal_hold,
    stage_legacy_snapshot,
)


FINGERPRINT_KEY = b"phase9-synthetic-fingerprint-key-only-0001"
REFERENCE_AT = datetime(2026, 8, 1, 3, 0, tzinfo=UTC)
RESOURCE_ID = "phase9-synthetic-drive-resource"


def _source(rows: list[LegacySourceRow], label: str) -> LegacySnapshotSource:
    return LegacySnapshotSource(
        snapshot_bytes=(
            label.encode("utf-8")
            + json.dumps(
                [dict(row.source_payload) for row in rows],
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
        ),
        rows=rows,
    )


def _ready_sources(
    *,
    email: str = "synthetic.student@st.kitasato-u.ac.jp",
    student_number: str = "PP23001",
    permission_id: str = "synthetic-permission-001",
) -> dict[str, LegacySnapshotSource]:
    common = {
        "氏名": "合成 試験者",
        "学籍番号": student_number,
        "自動収集メール": email,
        "入力大学メール": email,
        "academic_role": "undergraduate",
        "faculty_code": "pharmacy",
        "grade": "3",
        "terms_accepted": True,
        "privacy_accepted": True,
    }
    form = [
        LegacySourceRow(
            2,
            {**common, "タイムスタンプ": "2026/07/01 09:00:00"},
        )
    ]
    management = [
        LegacySourceRow(
            2,
            {
                **common,
                "処理日時": "2026/07/01 09:02:00",
                "招待対象メール": email,
                "申請種別": "学生利用登録",
            },
        )
    ]
    drive = [
        LegacySourceRow(
            1,
            {
                "id": permission_id,
                "emailAddress": email,
                "role": "reader",
                "type": "user",
            },
        )
    ]
    return {
        "google_form": _source(form, "form"),
        "management_sheet": _source(management, "management"),
        "drive_permission": _source(drive, "drive"),
    }


def _forty_member_sources() -> dict[str, LegacySnapshotSource]:
    form_rows: list[LegacySourceRow] = []
    management_rows: list[LegacySourceRow] = []
    drive_rows: list[LegacySourceRow] = []
    roster_rows: list[LegacySourceRow] = []

    for index in range(40):
        full_name = f"合成 会員{index:02d}"
        student_number = "" if index == 39 else f"PP{23000 + index:05d}"
        roster_grade = "卒業生" if index == 39 else "3年"
        roster_rows.append(
            LegacySourceRow(
                index + 2,
                {
                    "氏名": full_name,
                    "学籍番号": student_number,
                    "学年": roster_grade,
                    "登録日時": "",
                },
            )
        )
        if index >= 18:
            continue

        email = f"synthetic-{index:02d}@st.kitasato-u.ac.jp"
        common = {
            "氏名": full_name,
            "学籍番号": student_number,
            "自動収集メール": email,
            "入力大学メール": email,
            "academic_role": "undergraduate",
            "faculty_code": "pharmacy",
            "grade": "3",
            "terms_accepted": True,
            "privacy_accepted": True,
        }
        form_rows.append(
            LegacySourceRow(
                index + 2,
                {**common, "タイムスタンプ": "2026/07/01 09:00:00"},
            )
        )
        management_rows.append(
            LegacySourceRow(
                index + 2,
                {
                    **common,
                    "処理日時": "2026/07/01 09:02:00",
                    "招待対象メール": email,
                    "申請種別": "学生利用登録",
                },
            )
        )
        drive_rows.append(
            LegacySourceRow(
                index + 1,
                {
                    "id": f"synthetic-permission-{index:02d}",
                    "emailAddress": email,
                    "role": "reader",
                    "type": "user",
                },
            )
        )

    return {
        "google_form": _source(form_rows, "forty-form"),
        "management_sheet": _source(
            management_rows,
            "forty-management",
        ),
        "member_roster": _source(roster_rows, "forty-roster"),
        "drive_permission": _source(drive_rows, "forty-drive"),
    }


def _admin(session: Session) -> LibraryAdmin:
    admin = LibraryAdmin(
        google_sub=f"phase9-admin-{uuid4()}",
        role="admin",
        active=True,
    )
    session.add(admin)
    session.commit()
    return admin


def _stage(
    session: Session,
    sources: dict[str, LegacySnapshotSource] | None = None,
    *,
    reference_at: datetime = REFERENCE_AT,
):
    return stage_legacy_snapshot(
        session,
        reference_at=reference_at,
        sources=sources or _ready_sources(),
        fingerprint_key=FINGERPRINT_KEY,
        fingerprint_key_version="synthetic-key-v1",
        drive_resource_id=RESOURCE_ID,
        expected_drive_resource_fingerprint=drive_resource_fingerprint(
            FINGERPRINT_KEY,
            RESOURCE_ID,
        ),
    )


def _approve(session: Session, batch_id, admin: LibraryAdmin, suffix: str = "1"):
    return approve_legacy_import(
        session,
        batch_id,
        approved_by_admin_id=admin.id,
        reason=f"合成データdry-run差分を確認した承認理由 {suffix}",
        idempotency_key=f"phase9-synthetic-approval-{suffix}",
        fingerprint_key=FINGERPRINT_KEY,
    )


def test_stage_is_pii_free_dry_run_and_idempotent(session: Session) -> None:
    before = {
        model.__tablename__: session.scalar(select(func.count()).select_from(model))
        for model in (
            LibraryMember,
            LibraryAccessGrant,
            LibraryOperation,
            LibraryApplication,
            LibraryIdentity,
        )
    }
    sources = _ready_sources()
    original = dict(sources["google_form"].rows[0].source_payload)
    staged = _stage(session, sources)
    replay = _stage(session, sources)

    assert staged.status == "validated"
    assert replay.replayed is True
    assert replay.batch_id == staged.batch_id
    assert staged.report["row_count"] == 3
    assert staged.report["classification_counts"] == {
        "ready": 3,
        "manual_resolution": 0,
        "excluded": 0,
    }
    assert staged.report["operational_side_effects"] is False
    assert staged.report["target_drive_resource_fingerprint"] == (
        drive_resource_fingerprint(FINGERPRINT_KEY, RESOURCE_ID)
    )
    assert RESOURCE_ID not in json.dumps(staged.report)
    assert len(staged.report["staged_normalized_hash"]) == 64
    assert "synthetic.student" not in json.dumps(staged.report)
    assert sum(staged.report["source_counts"].values()) == 3
    assert staged.report["reconciliation_counts"] == {
        "drive_only": 0,
        "sheet_only": 0,
        "both": 1,
        "mismatch": 0,
    }
    assert staged.report["reconciliation_unique_email_count"] == 1
    assert staged.report["reconciliation_unkeyed_row_count"] == 0
    assert before == {
        model.__tablename__: session.scalar(select(func.count()).select_from(model))
        for model in (
            LibraryMember,
            LibraryAccessGrant,
            LibraryOperation,
            LibraryApplication,
            LibraryIdentity,
        )
    }
    assert session.scalar(select(func.count()).select_from(LibraryImportBatch)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryImportRow)) == 3

    row = session.scalar(
        select(LibraryImportRow).where(
            LibraryImportRow.source_system == "google_form"
        )
    )
    assert row.source_payload == original
    plain_hash = hashlib.sha256(
        json.dumps(
            original,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    assert row.raw_payload_hash != plain_hash
    with pytest.raises(
        ValueError,
        match="library_import_source_payload_is_immutable",
    ):
        row.source_payload = {"tampered": True}


def test_exact_artifact_bytes_are_part_of_snapshot_identity(session: Session) -> None:
    first = _ready_sources()
    second = _ready_sources()
    second["google_form"] = LegacySnapshotSource(
        snapshot_bytes=first["google_form"].snapshot_bytes + b"\n",
        rows=first["google_form"].rows,
    )
    first_result = _stage(session, first)
    second_result = _stage(session, second)
    assert first_result.batch_id != second_result.batch_id
    assert session.scalar(select(func.count()).select_from(LibraryImportBatch)) == 2


def test_stage_rejects_a_manifest_for_a_different_drive_target(
    session: Session,
) -> None:
    with pytest.raises(
        LegacyImportIntegrityError,
        match="target_drive_resource_mismatch",
    ):
        stage_legacy_snapshot(
            session,
            reference_at=REFERENCE_AT,
            sources=_ready_sources(),
            fingerprint_key=FINGERPRINT_KEY,
            fingerprint_key_version="synthetic-key-v1",
            drive_resource_id=RESOURCE_ID,
            expected_drive_resource_fingerprint=drive_resource_fingerprint(
                FINGERPRINT_KEY,
                "different-synthetic-drive-resource",
            ),
        )
    assert session.scalar(select(LibraryImportBatch)) is None


def test_ambiguous_legacy_values_and_email_mismatch_require_resolution(
    session: Session,
) -> None:
    form = [
        LegacySourceRow(
            2,
            {
                "氏名": "合成 曖昧",
                "学年": "5年 / 修士1年",
                "学籍番号": "PP23002",
                "自動収集メール": "first@st.kitasato-u.ac.jp",
                "入力大学メール": "second@st.kitasato-u.ac.jp",
                "利用規約": "理解しました",
                "個人情報": "理解しました",
            },
        )
    ]
    sources = {
        "google_form": _source(form, "ambiguous-form"),
        "management_sheet": _source([], "empty-management"),
        "drive_permission": _source([], "empty-drive"),
    }
    staged = _stage(session, sources)
    row = session.scalar(select(LibraryImportRow))
    assert row.classification == "manual_resolution"
    assert {
        "ambiguous_academic_role",
        "missing_faculty",
        "conflicting_email_fields",
    }.issubset(row.error_codes)
    assert row.normalized_payload["academic_role"] is None
    assert row.normalized_payload["faculty_code"] is None
    assert staged.report["classification_counts"]["manual_resolution"] == 1


def test_exact_japanese_pharmacy_value_maps_to_canonical_code(
    session: Session,
) -> None:
    sources = _ready_sources()
    for source_system in ("google_form", "management_sheet"):
        payload = dict(sources[source_system].rows[0].source_payload)
        payload.pop("faculty_code")
        payload["所属学部"] = "薬学部"
        sources[source_system] = _source(
            [LegacySourceRow(2, payload)],
            f"{source_system}-japanese-faculty",
        )

    staged = _stage(session, sources)
    roster_rows = list(
        session.scalars(
            select(LibraryImportRow).where(
                LibraryImportRow.source_system != "drive_permission"
            )
        )
    )
    assert staged.report["classification_counts"]["ready"] == 3
    assert {row.normalized_payload["faculty_code"] for row in roster_rows} == {
        "pharmacy"
    }


@pytest.mark.parametrize(
    ("source_system", "email"),
    [
        ("google_form", "person@sub.st.kitasato-u.ac.jp"),
        ("management_sheet", "person@kitasato-u.ac.jp"),
        ("drive_permission", "person@example.invalid"),
    ],
)
def test_every_source_requires_the_exact_workspace_email_domain(
    session: Session,
    source_system: str,
    email: str,
) -> None:
    sources = _ready_sources()
    payload = dict(sources[source_system].rows[0].source_payload)
    if source_system == "drive_permission":
        payload["emailAddress"] = email
        row_number = 1
    else:
        for field in (
            "自動収集メール",
            "入力大学メール",
            "招待対象メール",
        ):
            if field in payload:
                payload[field] = email
        row_number = 2
    sources[source_system] = _source(
        [LegacySourceRow(row_number, payload)],
        f"{source_system}-wrong-domain",
    )

    staged = _stage(session, sources)
    row = session.scalar(
        select(LibraryImportRow).where(
            LibraryImportRow.source_system == source_system
        )
    )
    assert "email_domain_not_allowed" in row.error_codes
    assert row.classification != "ready"
    assert staged.report["classification_counts"]["ready"] < 3


def test_snapshot_collision_matrix_is_classified(session: Session) -> None:
    sources = _ready_sources()
    duplicate = LegacySourceRow(
        3,
        dict(sources["google_form"].rows[0].source_payload),
    )
    sources["google_form"] = _source(
        [*sources["google_form"].rows, duplicate],
        "duplicate-form",
    )
    staged = _stage(session, sources)
    assert staged.report["issue_counts"]["duplicate_email_in_source"] == 2
    assert (
        staged.report["issue_counts"]["duplicate_student_number_in_source"]
        == 2
    )
    assert staged.report["classification_counts"]["manual_resolution"] == 4


def test_operational_collision_and_inactive_member_are_not_reactivated(
    session: Session,
) -> None:
    first = LibraryMember(
        normalized_email="synthetic.student@st.kitasato-u.ac.jp",
        normalized_student_number="PP23999",
        full_name="別 人物",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="inactive",
    )
    second = LibraryMember(
        normalized_email="other@st.kitasato-u.ac.jp",
        normalized_student_number="PP23001",
        full_name="別 人物二",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="active",
    )
    session.add_all([first, second])
    session.commit()
    staged = _stage(session)
    assert staged.report["issue_counts"]["existing_identity_split_conflict"] == 2
    assert session.get(LibraryMember, first.id).member_status == "inactive"


def test_preexisting_member_is_reused_and_never_deleted_by_rollback(
    session: Session,
) -> None:
    member = LibraryMember(
        normalized_email="synthetic.student@st.kitasato-u.ac.jp",
        normalized_student_number="PP23001",
        full_name="合成 試験者",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="active",
    )
    session.add(member)
    session.commit()
    original_version = member.record_version
    admin = _admin(session)
    staged = _stage(session)
    assert staged.report["classification_counts"]["ready"] == 3
    _approve(session, staged.batch_id, admin)
    applied = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert applied.created_members == 0
    assert applied.reused_members == 1
    rolled_back = rollback_legacy_import(
        session,
        staged.batch_id,
        rolled_back_by_admin_id=admin.id,
        reason="既存memberを削除しないrollback境界の合成検証",
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert rolled_back.deleted_members == 0
    assert rolled_back.deleted_access_grants == 1
    assert session.get(LibraryMember, member.id) is not None
    assert session.get(LibraryMember, member.id).record_version == original_version


def test_existing_google_identity_email_conflict_requires_resolution(
    session: Session,
) -> None:
    member = LibraryMember(
        normalized_email="synthetic.student@st.kitasato-u.ac.jp",
        normalized_student_number="PP23001",
        full_name="合成 試験者",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="active",
    )
    session.add(member)
    session.flush()
    session.add(
        LibraryIdentity(
            member_id=member.id,
            google_sub="synthetic-conflicting-google-sub",
            verified_email="different@st.kitasato-u.ac.jp",
            hosted_domain="st.kitasato-u.ac.jp",
        )
    )
    session.commit()
    staged = _stage(session)
    assert staged.report["issue_counts"]["existing_identity_email_conflict"] == 2
    assert staged.report["classification_counts"]["manual_resolution"] == 3


def test_apply_requires_explicit_admin_approval_and_never_enqueues_side_effects(
    session: Session,
) -> None:
    staged = _stage(session)
    with pytest.raises(
        LegacyImportStateError,
        match="legacy_import_batch_not_approved",
    ):
        apply_legacy_import(
            session,
            staged.batch_id,
            drive_resource_id=RESOURCE_ID,
            fingerprint_key=FINGERPRINT_KEY,
        )

    admin = _admin(session)
    approval = _approve(session, staged.batch_id, admin)
    approval_replay = _approve(session, staged.batch_id, admin)
    assert approval.status == "approved"
    assert approval_replay.replayed is True

    applied = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    replay = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert applied.created_members == 1
    assert applied.created_access_grants == 1
    assert replay.replayed is True
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryAccessGrant)) == 1
    grant = session.scalar(select(LibraryAccessGrant))
    assert grant.status == "already_granted"
    assert grant.managed_by_system is False
    assert grant.notification_status == "not_applicable"
    member = session.scalar(select(LibraryMember))
    assert member is not None
    assert member.registered_at is not None
    assert member.registered_at.replace(tzinfo=UTC) == datetime(
        2026,
        7,
        1,
        0,
        0,
        tzinfo=UTC,
    )
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 0


def test_confirmed_member_roster_imports_unlinked_members_without_guessing_email(
    session: Session,
) -> None:
    sources = _ready_sources()
    sources["member_roster"] = _source(
        [
            LegacySourceRow(
                2,
                {
                    "氏名": "合成 試験者",
                    "学籍番号": "PP23001",
                    "学年": "4年",
                },
            ),
            LegacySourceRow(
                3,
                {
                    "氏名": "合成 既存会員",
                    "学籍番号": "",
                    "学年": "卒業生",
                },
            ),
        ],
        "member-roster",
    )
    sources["drive_permission"] = _source(
        [
            *sources["drive_permission"].rows,
            LegacySourceRow(
                2,
                {
                    "id": "synthetic-permission-unlinked",
                    "emailAddress": "unlinked@st.kitasato-u.ac.jp",
                    "role": "reader",
                    "type": "user",
                },
            ),
        ],
        "drive-with-unlinked",
    )
    admin = _admin(session)
    staged = _stage(session, sources)

    assert staged.report["ready_member_roster_count"] == 2
    _approve(session, staged.batch_id, admin, "confirmed-roster")
    applied = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )

    assert applied.created_members == 2
    assert applied.created_access_grants == 1
    members = list(session.scalars(select(LibraryMember)))
    assert len(members) == 2
    linked = next(member for member in members if member.normalized_email)
    unlinked = next(member for member in members if member.normalized_email is None)
    assert linked.grade == "4"
    assert linked.academic_role == "undergraduate"
    assert unlinked.full_name == "合成 既存会員"
    assert unlinked.normalized_student_number is None
    assert unlinked.academic_role == "legacy_other"
    assert unlinked.faculty_code == "legacy_unknown"
    assert unlinked.registered_at is None
    assert {
        grant.member_id
        for grant in session.scalars(select(LibraryAccessGrant))
    } == {linked.id}
    assert session.scalar(select(func.count()).select_from(LibraryIdentity)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 0

    replay = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert replay.replayed is True
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 2
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryIdentity)) == 0


def test_confirmed_forty_member_roster_imports_twenty_two_unlinked_and_rolls_back(
    session: Session,
) -> None:
    admin = _admin(session)
    staged = _stage(session, _forty_member_sources())

    assert staged.report["ready_member_count"] == 18
    assert staged.report["ready_member_roster_count"] == 40
    assert staged.report["ready_permission_count"] == 18
    assert staged.report["classification_counts"]["manual_resolution"] == 0

    _approve(session, staged.batch_id, admin, "forty-members")
    applied = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )

    assert applied.created_members == 40
    assert applied.reused_members == 18
    assert applied.created_access_grants == 18
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 40
    assert session.scalar(
        select(func.count()).select_from(LibraryMember).where(
            LibraryMember.normalized_email.is_(None)
        )
    ) == 22
    assert session.scalar(select(func.count()).select_from(LibraryAccessGrant)) == 18
    assert session.scalar(select(func.count()).select_from(LibraryIdentity)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 0
    grant_member_ids = set(
        session.scalars(select(LibraryAccessGrant.member_id))
    )
    assert all(
        member.normalized_email is not None
        for member in session.scalars(
            select(LibraryMember).where(LibraryMember.id.in_(grant_member_ids))
        )
    )

    replay = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert replay.replayed is True
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 40

    rolled_back = rollback_legacy_import(
        session,
        staged.batch_id,
        rolled_back_by_admin_id=admin.id,
        reason="40名の合成名簿移行を安全に取り消せることを確認する",
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert rolled_back.deleted_members == 40
    assert rolled_back.deleted_access_grants == 18
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryAccessGrant)) == 0

    _approve(session, staged.batch_id, admin, "forty-members-reapply")
    reapplied = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert reapplied.created_members == 40
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 40
    assert session.scalar(select(func.count()).select_from(LibraryAccessGrant)) == 18


def test_roster_name_conflict_for_same_student_number_is_not_auto_applied(
    session: Session,
) -> None:
    sources = _ready_sources()
    sources["member_roster"] = _source(
        [
            LegacySourceRow(
                2,
                {
                    "氏名": "別人として扱う氏名",
                    "学籍番号": "PP23001",
                    "学年": "3年",
                },
            )
        ],
        "conflicting-roster-name",
    )

    staged = _stage(session, sources)
    roster_row = session.scalar(
        select(LibraryImportRow).where(
            LibraryImportRow.source_system == "member_roster"
        )
    )

    assert roster_row is not None
    assert roster_row.classification == "manual_resolution"
    assert "conflicting_name_for_student_number" in roster_row.error_codes
    assert staged.report["ready_member_roster_count"] == 0
    assert session.scalar(select(LibraryMember)) is None


def test_roster_nonblank_invalid_student_number_requires_resolution(
    session: Session,
) -> None:
    sources = _ready_sources()
    sources["member_roster"] = _source(
        [
            LegacySourceRow(
                2,
                {
                    "氏名": "合成 不正番号",
                    "学籍番号": "UNKNOWN-123",
                    "学年": "その他",
                },
            )
        ],
        "invalid-roster-student-number",
    )

    staged = _stage(session, sources)
    roster_row = session.scalar(
        select(LibraryImportRow).where(
            LibraryImportRow.source_system == "member_roster"
        )
    )

    assert roster_row is not None
    assert roster_row.classification == "manual_resolution"
    assert "invalid_student_number" in roster_row.error_codes
    assert staged.report["ready_member_roster_count"] == 0


def test_unkeyed_existing_member_profile_conflict_is_visible_before_approval(
    session: Session,
) -> None:
    session.add(
        LibraryMember(
            normalized_email=None,
            normalized_student_number=None,
            full_name="合成 空欄会員",
            academic_role="legacy_other",
            faculty_code="legacy_unknown",
            grade=None,
            member_status="active",
        )
    )
    session.commit()
    sources = _ready_sources()
    sources["member_roster"] = _source(
        [
            LegacySourceRow(
                2,
                {
                    "氏名": "合成 空欄会員",
                    "学籍番号": "",
                    "学年": "M1",
                },
            )
        ],
        "unkeyed-profile-conflict",
    )

    staged = _stage(session, sources)
    roster_row = session.scalar(
        select(LibraryImportRow).where(
            LibraryImportRow.source_system == "member_roster"
        )
    )

    assert roster_row is not None
    assert roster_row.classification == "manual_resolution"
    assert "existing_confirmed_roster_profile_conflict" in roster_row.error_codes
    assert staged.report["ready_member_roster_count"] == 0
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1


def test_apply_rejects_a_different_drive_target_even_on_replay(
    session: Session,
) -> None:
    admin = _admin(session)
    staged = _stage(session)
    _approve(session, staged.batch_id, admin, "target")

    with pytest.raises(
        LegacyImportIntegrityError,
        match="target_drive_resource_mismatch",
    ):
        apply_legacy_import(
            session,
            staged.batch_id,
            drive_resource_id="different-synthetic-drive-resource",
            fingerprint_key=FINGERPRINT_KEY,
        )
    assert session.scalar(select(LibraryMember)) is None

    apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    with pytest.raises(
        LegacyImportIntegrityError,
        match="target_drive_resource_mismatch",
    ):
        apply_legacy_import(
            session,
            staged.batch_id,
            drive_resource_id="different-synthetic-drive-resource",
            fingerprint_key=FINGERPRINT_KEY,
        )


def test_apply_rollback_reapprove_reimport_has_no_duplicates(session: Session) -> None:
    admin = _admin(session)
    staged = _stage(session)
    _approve(session, staged.batch_id, admin)
    apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    rolled_back = rollback_legacy_import(
        session,
        staged.batch_id,
        rolled_back_by_admin_id=admin.id,
        reason="合成取込のbatch単位rollbackを検証するため",
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert rolled_back.deleted_members == 1
    assert rolled_back.deleted_access_grants == 1
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 0

    _approve(session, staged.batch_id, admin, suffix="2")
    reapplied = apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    assert reapplied.created_members == 1
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryAccessGrant)) == 1


def test_rollback_refuses_changed_or_dependent_imported_member(session: Session) -> None:
    admin = _admin(session)
    staged = _stage(session)
    _approve(session, staged.batch_id, admin)
    apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    member = session.scalar(select(LibraryMember))
    member.full_name = "事後変更された氏名"
    session.commit()
    with pytest.raises(
        LegacyImportConflictError,
        match="imported_member_changed",
    ):
        rollback_legacy_import(
            session,
            staged.batch_id,
            rolled_back_by_admin_id=admin.id,
            reason="変更後の危険なrollbackを拒否する検証",
            fingerprint_key=FINGERPRINT_KEY,
        )
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1
    assert session.get(LibraryImportBatch, staged.batch_id).status == "applied"


def test_normalized_payload_change_before_approval_is_detected(session: Session) -> None:
    admin = _admin(session)
    staged = _stage(session)
    row = session.scalar(
        select(LibraryImportRow).where(
            LibraryImportRow.source_system == "google_form"
        )
    )
    row.normalized_payload = {**row.normalized_payload, "grade": "4"}
    session.commit()
    with pytest.raises(
        LegacyImportIntegrityError,
        match="legacy_import_normalized_row_mismatch",
    ):
        _approve(session, staged.batch_id, admin)


def test_reject_and_expired_snapshot_purge_respect_legal_hold(session: Session) -> None:
    admin = _admin(session)
    staged = _stage(
        session,
        reference_at=REFERENCE_AT - timedelta(days=100),
    )
    rejected = reject_legacy_import(
        session,
        staged.batch_id,
        rejected_by_admin_id=admin.id,
        reason="合成dry-run差分に未解決事項があるため却下",
    )
    held = set_legacy_import_legal_hold(
        session,
        rejected.id,
        admin_id=admin.id,
        enabled=True,
        reason="合成snapshotを法的保全対象として保持する検証理由",
        idempotency_key="phase9-hold-synthetic-0001",
    )
    held_replay = set_legacy_import_legal_hold(
        session,
        rejected.id,
        admin_id=admin.id,
        enabled=True,
        reason="合成snapshotを法的保全対象として保持する検証理由",
        idempotency_key="phase9-hold-synthetic-0001",
    )
    assert held.legal_hold is True
    assert held_replay.replayed is True
    assert purge_expired_legacy_snapshots(
        session,
        now=REFERENCE_AT,
        admin_id=admin.id,
        reason="期限到来済み合成snapshotの削除可否を検証する理由",
        idempotency_key="phase9-purge-synthetic-0001",
    ) == 0

    unheld = set_legacy_import_legal_hold(
        session,
        rejected.id,
        admin_id=admin.id,
        enabled=False,
        reason="合成snapshotの法的保全を解除する検証理由です",
        idempotency_key="phase9-unhold-synthetic-0001",
    )
    assert unheld.legal_hold is False
    assert purge_expired_legacy_snapshots(
        session,
        now=REFERENCE_AT,
        admin_id=admin.id,
        reason="期限到来済み合成snapshotの削除可否を検証する理由",
        idempotency_key="phase9-purge-synthetic-0002",
    ) == 1
    batch = session.get(LibraryImportBatch, staged.batch_id)
    assert batch.raw_purged_at == REFERENCE_AT
    for row in batch.rows:
        assert row.source_payload == {}
        assert row.normalized_payload == {}
        assert row.error_codes == []
        assert row.source_row_fingerprint
        assert row.raw_payload_hash
        if row.source_system == "drive_permission":
            assert row.legacy_terms_consent_recorded is None
            assert row.legacy_privacy_consent_recorded is None
            assert row.consent_version_provenance == "not_applicable"
            assert row.consent_timestamp_provenance == "not_applicable"
        else:
            assert row.legacy_terms_consent_recorded is True
            assert row.legacy_privacy_consent_recorded is True
            assert row.consent_version_provenance == "legacy_unknown"
            assert row.consent_timestamp_provenance == "legacy_unknown"
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 0
    assert [
        audit.action
        for audit in session.scalars(
            select(LibraryAdminAudit).order_by(LibraryAdminAudit.created_at)
        )
    ] == [
        "legacy_import_rejected",
        "legacy_import_legal_hold_enabled",
        "legacy_import_legal_hold_disabled",
        "legacy_import_raw_snapshot_purged",
    ]


def test_phase9_state_changes_append_non_pii_admin_audit(session: Session) -> None:
    admin = _admin(session)
    staged = _stage(session)
    _approve(session, staged.batch_id, admin, "audit")
    apply_legacy_import(
        session,
        staged.batch_id,
        drive_resource_id=RESOURCE_ID,
        fingerprint_key=FINGERPRINT_KEY,
    )
    rollback_legacy_import(
        session,
        staged.batch_id,
        rolled_back_by_admin_id=admin.id,
        reason="合成移行監査のrollback確認理由です",
        fingerprint_key=FINGERPRINT_KEY,
    )

    audits = list(
        session.scalars(
            select(LibraryAdminAudit).order_by(LibraryAdminAudit.created_at)
        )
    )
    assert [item.action for item in audits] == [
        "legacy_import_approved",
        "legacy_import_applied",
        "legacy_import_rolled_back",
    ]
    serialized = json.dumps(
        [item.metadata_json for item in audits],
        ensure_ascii=False,
    )
    assert "synthetic.student@st.kitasato-u.ac.jp" not in serialized
    assert "PP23001" not in serialized
    assert all(item.result == "accepted" for item in audits)


def test_apply_rechecks_that_approving_admin_is_active(session: Session) -> None:
    admin = _admin(session)
    staged = _stage(session)
    _approve(session, staged.batch_id, admin, "inactive")
    admin.active = False
    session.commit()

    with pytest.raises(
        LegacyImportStateError,
        match="active_admin_approval_required",
    ):
        apply_legacy_import(
            session,
            staged.batch_id,
            drive_resource_id=RESOURCE_ID,
            fingerprint_key=FINGERPRINT_KEY,
        )
    assert session.scalar(select(LibraryMember)) is None
