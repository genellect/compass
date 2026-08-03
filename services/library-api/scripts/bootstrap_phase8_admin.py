"""Bootstrap an administrator from a manually verified Google subject.

The raw subject is accepted only through the process environment and is never
printed. This script is intentionally not exposed as an HTTP endpoint.
"""

from __future__ import annotations

import hashlib
import os

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import LibraryAdmin
from app.db.session import create_database_engine


class AdminBootstrapConflict(RuntimeError):
    """Raised when bootstrap would alter an existing administrator."""


def create_bootstrap_admin(
    session: Session,
    *,
    subject: str,
    role: str,
) -> LibraryAdmin:
    """Create one administrator without any update or reactivation path."""
    existing = session.scalar(
        select(LibraryAdmin).where(LibraryAdmin.google_sub == subject)
    )
    if existing is not None:
        raise AdminBootstrapConflict("administrator_already_exists")

    admin = LibraryAdmin(google_sub=subject, role=role, active=True)
    session.add(admin)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        # A concurrent insert must fail closed rather than becoming an update.
        raise AdminBootstrapConflict("administrator_already_exists") from error
    return admin


def main() -> int:
    subject = os.environ.get("PHASE8_BOOTSTRAP_GOOGLE_SUB", "").strip()
    role = os.environ.get("PHASE8_BOOTSTRAP_ROLE", "admin").strip().lower()
    if not subject:
        print("PHASE8_BOOTSTRAP_GOOGLE_SUB is required.")
        return 2
    if role not in {"viewer", "operator", "admin"}:
        print("PHASE8_BOOTSTRAP_ROLE must be viewer, operator, or admin.")
        return 2
    settings = get_settings()
    if (
        settings.app_env.lower() == "production"
        and os.environ.get("PHASE8_BOOTSTRAP_CONFIRM", "")
        != "I_CONFIRMED_THE_VERIFIED_GOOGLE_SUB"
    ):
        print("Production bootstrap confirmation is missing.")
        return 2

    engine = create_database_engine(settings, migration=True)
    try:
        with Session(engine) as session:
            try:
                create_bootstrap_admin(
                    session,
                    subject=subject,
                    role=role,
                )
            except AdminBootstrapConflict:
                fingerprint = hashlib.sha256(
                    subject.encode("utf-8")
                ).hexdigest()[:16]
                print(
                    "Admin already exists; refusing role or active-state "
                    f"changes; subject_fingerprint={fingerprint}"
                )
                return 3
    finally:
        engine.dispose()

    fingerprint = hashlib.sha256(subject.encode("utf-8")).hexdigest()[:16]
    print(f"Admin created; role={role}; subject_fingerprint={fingerprint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
