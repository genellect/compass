from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryApplication,
    LibraryIdentity,
    LibraryMember,
)
from app.registration_service import (
    PersistenceConflictError,
    persist_registration,
)
from app.schemas import EligibilityStatus
from tests.factories import student_registration


SETTINGS = Settings(
    database_url="sqlite+pysqlite:///:memory:",
    external_side_effects_enabled=False,
    phase6_auth_api_enabled=True,
    google_oauth_client_ids="phase6-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    drive_resource_id="phase6-synthetic-drive",
)


def identity(
    *,
    google_sub: str = "synthetic-subject-one",
    email: str = "student@st.kitasato-u.ac.jp",
) -> VerifiedGoogleIdentity:
    return VerifiedGoogleIdentity(
        google_sub=google_sub,
        email=email,
        email_verified=True,
        hosted_domain="st.kitasato-u.ac.jp",
        issuer="https://accounts.google.com",
        audience="phase6-client-id",
    )


def test_authenticated_registration_links_subject_atomically(
    session: Session,
) -> None:
    google_identity = identity()
    result = persist_registration(
        session,
        google_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-authenticated-registration-0001",
        settings=SETTINGS,
        identity=google_identity,
        source="phase6_authenticated",
    )

    assert result.eligibility.status == EligibilityStatus.APPROVED
    assert result.identity_linked is True
    stored_identity = session.scalar(select(LibraryIdentity))
    application = session.get(LibraryApplication, result.application_id)
    assert stored_identity is not None
    assert application is not None
    assert stored_identity.member_id == result.member_id
    assert stored_identity.verified_email == google_identity.email
    assert stored_identity.hosted_domain == "st.kitasato-u.ac.jp"
    assert stored_identity.audience == "phase6-client-id"
    assert application.authentication_subject_hash == google_identity.subject_hash
    assert application.source == "phase6_authenticated"


def test_same_subject_replays_and_does_not_duplicate_identity(
    session: Session,
) -> None:
    google_identity = identity()
    first = persist_registration(
        session,
        google_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-idempotent-registration-0001",
        settings=SETTINGS,
        identity=google_identity,
        source="phase6_authenticated",
    )
    replay = persist_registration(
        session,
        google_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-idempotent-registration-0001",
        settings=SETTINGS,
        identity=google_identity,
        source="phase6_authenticated",
    )
    repeated = persist_registration(
        session,
        google_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-idempotent-registration-0002",
        settings=SETTINGS,
        identity=google_identity,
        source="phase6_authenticated",
    )

    assert replay.replayed is True
    assert replay.application_id == first.application_id
    assert replay.identity_linked is True
    assert repeated.eligibility.status == EligibilityStatus.ALREADY_REGISTERED
    assert repeated.member_id == first.member_id
    assert session.scalar(select(func.count()).select_from(LibraryMember)) == 1
    assert session.scalar(select(func.count()).select_from(LibraryIdentity)) == 1


def test_idempotency_key_cannot_be_replayed_by_another_subject(
    session: Session,
) -> None:
    first_identity = identity()
    persist_registration(
        session,
        first_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-cross-subject-idempotency-0001",
        settings=SETTINGS,
        identity=first_identity,
        source="phase6_authenticated",
    )
    second_identity = identity(google_sub="synthetic-subject-two")

    try:
        persist_registration(
            session,
            second_identity.to_account_facts(SETTINGS),
            student_registration(),
            "phase6-cross-subject-idempotency-0001",
            settings=SETTINGS,
            identity=second_identity,
            source="phase6_authenticated",
        )
    except PersistenceConflictError:
        pass
    else:
        raise AssertionError("another subject replayed the idempotency key")


def test_existing_identity_prevents_silent_second_subject_link(
    session: Session,
) -> None:
    first_identity = identity()
    first = persist_registration(
        session,
        first_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-first-subject-0001",
        settings=SETTINGS,
        identity=first_identity,
        source="phase6_authenticated",
    )
    second_identity = identity(google_sub="synthetic-subject-two")
    second = persist_registration(
        session,
        second_identity.to_account_facts(SETTINGS),
        student_registration(),
        "phase6-second-subject-0001",
        settings=SETTINGS,
        identity=second_identity,
        source="phase6_authenticated",
    )

    assert first.member_id == second.member_id
    assert second.eligibility.status == EligibilityStatus.MANUAL_REVIEW
    assert second.identity_linked is False
    assert session.scalar(select(func.count()).select_from(LibraryIdentity)) == 1
