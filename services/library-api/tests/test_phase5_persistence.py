from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.orm.exc import StaleDataError

from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryIdentity,
    LibraryMember,
    LibraryOperation,
)
from app.registration_service import PersistenceConflictError, persist_registration
from app.schemas import EligibilityStatus
from tests.factories import student_account, student_registration


LOCAL_SETTINGS = Settings(
    database_url="sqlite+pysqlite:///:memory:",
    database_url_unpooled="sqlite+pysqlite:///:memory:",
    external_side_effects_enabled=False,
    drive_resource_id="phase5-test-drive",
)


def test_approved_registration_persists_member_history_and_outbox(
    session: Session,
) -> None:
    result = persist_registration(
        session,
        student_account(),
        student_registration(),
        "approved-registration-0001",
        settings=LOCAL_SETTINGS,
    )

    assert result.eligibility.status == EligibilityStatus.APPROVED
    assert result.persisted is True
    assert result.replayed is False
    assert result.member_id is not None
    assert result.application_id is not None

    member = session.get(LibraryMember, result.member_id)
    assert member is not None
    assert member.member_status == "active"
    assert member.normalized_student_number == "PP23000"
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryAccessGrant)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 1


def test_same_idempotency_key_replays_without_new_rows(
    session: Session,
) -> None:
    first = persist_registration(
        session,
        student_account(),
        student_registration(),
        "idempotent-registration-0001",
        settings=LOCAL_SETTINGS,
    )
    second = persist_registration(
        session,
        student_account(),
        student_registration(),
        "idempotent-registration-0001",
        settings=LOCAL_SETTINGS,
    )

    assert second.replayed is True
    assert second.application_id == first.application_id
    assert second.member_id == first.member_id
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 1


def test_same_idempotency_key_rejects_changed_payload(session: Session) -> None:
    persist_registration(
        session,
        student_account(),
        student_registration(),
        "idempotent-payload-registration-0001",
        settings=LOCAL_SETTINGS,
    )

    try:
        persist_registration(
            session,
            student_account(),
            student_registration(full_name="Different Synthetic Name"),
            "idempotent-payload-registration-0001",
            settings=LOCAL_SETTINGS,
        )
    except PersistenceConflictError:
        pass
    else:
        raise AssertionError("changed payload was accepted for the same key")


def test_same_member_with_new_key_is_recorded_as_already_registered(
    session: Session,
) -> None:
    first = persist_registration(
        session,
        student_account(),
        student_registration(),
        "existing-registration-0001",
        settings=LOCAL_SETTINGS,
    )
    second = persist_registration(
        session,
        student_account(),
        student_registration(),
        "existing-registration-0002",
        settings=LOCAL_SETTINGS,
    )

    assert second.eligibility.status == EligibilityStatus.ALREADY_REGISTERED
    assert second.member_id == first.member_id
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 2
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 1


def test_authentication_failure_is_not_persisted(session: Session) -> None:
    result = persist_registration(
        session,
        student_account(email="personal@gmail.com", hosted_domain=""),
        student_registration(),
        "rejected-authentication-0001",
        settings=LOCAL_SETTINGS,
    )

    assert result.eligibility.status == EligibilityStatus.INELIGIBLE
    assert result.persisted is False
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 0
    assert session.scalar(select(func.count()).select_from(LibraryApplication)) == 0


def test_business_rule_rejection_is_retained_without_member(
    session: Session,
) -> None:
    result = persist_registration(
        session,
        student_account(),
        student_registration(student_number="PX23000"),
        "invalid-student-number-0001",
        settings=LOCAL_SETTINGS,
    )

    assert result.eligibility.status == EligibilityStatus.INELIGIBLE
    assert result.persisted is True
    assert result.member_id is None
    application = session.get(LibraryApplication, result.application_id)
    assert application is not None
    assert application.retention_until is not None
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 0


def test_manual_review_creates_pending_member(session: Session) -> None:
    result = persist_registration(
        session,
        student_account(),
        student_registration(faculty="other"),
        "manual-review-0001",
        settings=LOCAL_SETTINGS,
    )

    assert result.eligibility.status == EligibilityStatus.MANUAL_REVIEW
    member = session.get(LibraryMember, result.member_id)
    assert member is not None
    assert member.member_status == "pending_review"
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 0


def test_existing_member_information_conflict_requires_manual_review(
    session: Session,
) -> None:
    first = persist_registration(
        session,
        student_account(),
        student_registration(),
        "conflicting-registration-0001",
        settings=LOCAL_SETTINGS,
    )
    second = persist_registration(
        session,
        student_account(),
        student_registration(student_number="PP23001"),
        "conflicting-registration-0002",
        settings=LOCAL_SETTINGS,
    )

    assert second.eligibility.status == EligibilityStatus.MANUAL_REVIEW
    assert second.member_id == first.member_id
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1


def test_database_unique_constraint_rejects_duplicate_email(
    session: Session,
) -> None:
    session.add_all(
        [
            LibraryMember(
                normalized_email="duplicate@st.kitasato-u.ac.jp",
                normalized_student_number="PP23010",
                full_name="北里 一郎",
                academic_role="undergraduate",
                faculty_code="pharmacy",
                grade="3",
                member_status="active",
            ),
            LibraryMember(
                normalized_email="duplicate@st.kitasato-u.ac.jp",
                normalized_student_number="PP23011",
                full_name="北里 二郎",
                academic_role="undergraduate",
                faculty_code="pharmacy",
                grade="3",
                member_status="active",
            ),
        ]
    )

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
    else:
        raise AssertionError("duplicate normalized_email was accepted")


def test_database_accepts_multiple_confirmed_members_without_email(
    session: Session,
) -> None:
    session.add_all(
        [
            LibraryMember(
                normalized_email=None,
                normalized_student_number="PP23090",
                full_name="旧会員 一郎",
                academic_role="undergraduate",
                faculty_code="legacy_unknown",
                grade="4",
                member_status="active",
            ),
            LibraryMember(
                normalized_email=None,
                normalized_student_number=None,
                full_name="旧会員 二郎",
                academic_role="legacy_other",
                faculty_code="legacy_unknown",
                grade=None,
                member_status="active",
            ),
        ]
    )

    session.commit()

    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 2
    assert all(
        member.normalized_email is None
        for member in session.scalars(select(LibraryMember))
    )


def test_database_unique_constraint_rejects_duplicate_student_number(
    session: Session,
) -> None:
    session.add_all(
        [
            LibraryMember(
                normalized_email="first@st.kitasato-u.ac.jp",
                normalized_student_number="PP23012",
                full_name="北里 四郎",
                academic_role="undergraduate",
                faculty_code="pharmacy",
                grade="3",
                member_status="active",
            ),
            LibraryMember(
                normalized_email="second@st.kitasato-u.ac.jp",
                normalized_student_number="PP23012",
                full_name="北里 五郎",
                academic_role="undergraduate",
                faculty_code="pharmacy",
                grade="3",
                member_status="active",
            ),
        ]
    )

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
    else:
        raise AssertionError("duplicate normalized_student_number was accepted")


def test_database_unique_constraint_rejects_duplicate_google_sub(
    session: Session,
) -> None:
    first_member = LibraryMember(
        normalized_email="identity-one@st.kitasato-u.ac.jp",
        normalized_student_number="PP23013",
        full_name="北里 六郎",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="active",
    )
    second_member = LibraryMember(
        normalized_email="identity-two@st.kitasato-u.ac.jp",
        normalized_student_number="PP23014",
        full_name="北里 七郎",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="active",
    )
    session.add_all([first_member, second_member])
    session.flush()
    session.add_all(
        [
            LibraryIdentity(
                member_id=first_member.id,
                google_sub="synthetic-google-sub",
                verified_email=first_member.normalized_email,
                hosted_domain="kitasato-u.ac.jp",
            ),
            LibraryIdentity(
                member_id=second_member.id,
                google_sub="synthetic-google-sub",
                verified_email=second_member.normalized_email,
                hosted_domain="kitasato-u.ac.jp",
            ),
        ]
    )

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
    else:
        raise AssertionError("duplicate google_sub was accepted")


def test_optimistic_lock_detects_stale_member_update(engine) -> None:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    seed = factory()
    member = LibraryMember(
        normalized_email="versioned@st.kitasato-u.ac.jp",
        normalized_student_number="PP23020",
        full_name="北里 三郎",
        academic_role="undergraduate",
        faculty_code="pharmacy",
        grade="3",
        member_status="active",
    )
    seed.add(member)
    seed.commit()
    member_id = member.id
    seed.close()

    first = factory()
    second = factory()
    first_member = first.get(LibraryMember, member_id)
    second_member = second.get(LibraryMember, member_id)
    assert first_member is not None
    assert second_member is not None

    first_member.grade = "4"
    first.commit()
    second_member.grade = "5"
    try:
        second.commit()
    except StaleDataError:
        second.rollback()
    else:
        raise AssertionError("stale update was accepted")
    finally:
        first.close()
        second.close()
