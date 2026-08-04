"""Fail-closed 200-registration PostgreSQL load/idempotency evidence.

This harness talks only to a localhost PostgreSQL database whose name contains
``synthetic``. It calls the persistence transaction directly and cannot invoke
Google OAuth, Drive, Cloud Run, Neon, or any other external API.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from time import perf_counter
from urllib.parse import urlsplit

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryMember,
    LibraryOperation,
)
from app.db.session import create_database_engine
from app.registration_service import persist_registration
from app.schemas import (
    AcademicRole,
    AccountFacts,
    EligibilityStatus,
    FacultyCode,
    RegistrationInput,
)


REGISTRATION_COUNT = 200
CONCURRENCY = 2
SYNTHETIC_PREFIX = "synthetic-load-"


def _guard_local_synthetic_url() -> str:
    if os.environ.get("FSL_DATA_CLASSIFICATION") != "synthetic-only":
        raise RuntimeError("FSL_DATA_CLASSIFICATION=synthetic-only is required.")
    if os.environ.get("FSL_PHASE8A_LOCAL_EVIDENCE") != "confirmed":
        raise RuntimeError("FSL_PHASE8A_LOCAL_EVIDENCE=confirmed is required.")
    required_flags = {
        "EXTERNAL_SIDE_EFFECTS_ENABLED": "false",
        "PHASE7_DRIVE_API_ENABLED": "false",
        "PHASE7_DRIVE_KILL_SWITCH": "true",
    }
    for name, expected in required_flags.items():
        if os.environ.get(name, "").lower() != expected:
            raise RuntimeError(f"{name} must be {expected}.")

    value = os.environ.get("DATABASE_URL", "").strip()
    normalized = value.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlsplit(normalized)
    database_name = parsed.path.removeprefix("/").lower()
    if (
        parsed.scheme != "postgresql"
        or parsed.hostname not in {"127.0.0.1", "localhost"}
        or "synthetic" not in database_name
        or parsed.username != "postgres"
    ):
        raise RuntimeError(
            "Load evidence requires a localhost PostgreSQL synthetic database."
        )
    return value


def _account(index: int) -> AccountFacts:
    return AccountFacts(
        verified=True,
        token_valid=True,
        email_verified=True,
        email=f"{SYNTHETIC_PREFIX}{index:03d}@st.kitasato-u.ac.jp",
        hosted_domain="st.kitasato-u.ac.jp",
        allowed_hosted_domains=["st.kitasato-u.ac.jp"],
    )


def _registration(index: int) -> RegistrationInput:
    return RegistrationInput(
        full_name=f"SYNTHETIC USER {index:03d}",
        academic_role=AcademicRole.UNDERGRADUATE,
        faculty=FacultyCode.PHARMACY,
        grade=str(index % 6 + 1),
        student_number=f"PP{10000 + index:05d}",
        terms_accepted=True,
        privacy_accepted=True,
        question="",
    )


def _counts(session_factory: sessionmaker[Session]) -> dict[str, int]:
    with session_factory() as session:
        return {
            "members": session.scalar(select(func.count()).select_from(LibraryMember)),
            "applications": session.scalar(
                select(func.count()).select_from(LibraryApplication)
            ),
            "access_grants": session.scalar(
                select(func.count()).select_from(LibraryAccessGrant)
            ),
            "operations": session.scalar(
                select(func.count()).select_from(LibraryOperation)
            ),
        }


def main() -> None:
    database_url = _guard_local_synthetic_url()
    settings = Settings(
        app_env="phase8a-local-synthetic",
        database_url=database_url,
        database_url_unpooled=database_url,
        db_pool_size=CONCURRENCY,
        db_max_overflow=0,
        db_pool_timeout_seconds=10,
        external_side_effects_enabled=False,
        phase7_drive_api_enabled=False,
        phase7_drive_kill_switch=True,
        drive_resource_id="synthetic-phase8a-resource",
        pii_logging_enabled=False,
    )
    engine = create_database_engine(settings)
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    try:
        with engine.connect() as connection:
            current_database = connection.execute(text("SELECT current_database()"))
            if "synthetic" not in current_database.scalar_one().lower():
                raise RuntimeError("Connected database is not marked synthetic.")
        if any(_counts(session_factory).values()):
            raise RuntimeError("Load evidence requires empty application tables.")

        def submit(index: int) -> tuple[bool, str]:
            with session_factory() as session:
                result = persist_registration(
                    session,
                    _account(index),
                    _registration(index),
                    f"phase8a-synthetic-{index:03d}",
                    settings=settings,
                    source="phase8a_synthetic",
                )
                return result.replayed, str(result.eligibility.status)

        started = perf_counter()
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
            first_results = list(executor.map(submit, range(REGISTRATION_COUNT)))
        first_elapsed = perf_counter() - started

        if any(replayed for replayed, _status in first_results):
            raise RuntimeError("A first submission was incorrectly treated as replayed.")
        if any(
            status != str(EligibilityStatus.APPROVED)
            for _replayed, status in first_results
        ):
            raise RuntimeError("A synthetic eligible registration was not approved.")

        first_counts = _counts(session_factory)
        expected_counts = {
            "members": REGISTRATION_COUNT,
            "applications": REGISTRATION_COUNT,
            "access_grants": REGISTRATION_COUNT,
            "operations": REGISTRATION_COUNT,
        }
        if first_counts != expected_counts:
            raise RuntimeError("Initial registration counts are incomplete or duplicated.")

        replay_started = perf_counter()
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
            replay_results = list(executor.map(submit, range(REGISTRATION_COUNT)))
        replay_elapsed = perf_counter() - replay_started
        if not all(replayed for replayed, _status in replay_results):
            raise RuntimeError("An idempotent replay created a new logical registration.")
        if _counts(session_factory) != expected_counts:
            raise RuntimeError("Idempotent replay changed persisted row counts.")

        with session_factory() as session:
            non_synthetic_members = session.scalar(
                select(func.count())
                .select_from(LibraryMember)
                .where(
                    ~LibraryMember.normalized_email.like(
                        f"{SYNTHETIC_PREFIX}%@st.kitasato-u.ac.jp"
                    )
                )
            )
            non_pending_operations = session.scalar(
                select(func.count())
                .select_from(LibraryOperation)
                .where(LibraryOperation.status != "pending")
            )
        if non_synthetic_members or non_pending_operations:
            raise RuntimeError("Synthetic boundary or finite outbox state was violated.")

        print(
            json.dumps(
                {
                    "status": "pass",
                    "classification": "synthetic-only",
                    "requested_registrations": REGISTRATION_COUNT,
                    "concurrency": CONCURRENCY,
                    "persisted_counts": first_counts,
                    "idempotent_replays": REGISTRATION_COUNT,
                    "first_pass_seconds": round(first_elapsed, 3),
                    "replay_seconds": round(replay_elapsed, 3),
                    "external_side_effects": False,
                    "remote_services_contacted": False,
                },
                separators=(",", ":"),
            )
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
