"""Read-only Phase 6A schema verification for the synthetic Neon project."""

from __future__ import annotations

import json

from sqlalchemy import text

from app.config import Settings
from app.db.session import create_database_engine, is_transaction_pooler_url


EXPECTED_REVISION = "6bb0eb9832ab"
EXPECTED_IDENTITY_COLUMNS = {
    "audience",
    "email_verified",
    "issuer",
    "last_verified_at",
}
EXPECTED_APPLICATION_COLUMN = "authentication_subject_hash"


def main() -> None:
    settings = Settings()
    if settings.external_side_effects_enabled:
        raise RuntimeError("External side effects must remain disabled.")
    if not is_transaction_pooler_url(settings.database_url):
        raise RuntimeError("DATABASE_URL must use the Neon pooled endpoint.")

    engine = create_database_engine(settings)
    try:
        with engine.connect() as connection:
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
            identity_columns = set(
                connection.execute(
                    text(
                        "SELECT column_name "
                        "FROM information_schema.columns "
                        "WHERE table_schema = 'public' "
                        "AND table_name = 'library_identities'"
                    )
                ).scalars()
            )
            application_columns = set(
                connection.execute(
                    text(
                        "SELECT column_name "
                        "FROM information_schema.columns "
                        "WHERE table_schema = 'public' "
                        "AND table_name = 'library_applications'"
                    )
                ).scalars()
            )
    finally:
        engine.dispose()

    if revision != EXPECTED_REVISION:
        raise RuntimeError("Neon is not at the Phase 6A revision.")
    missing_identity_columns = EXPECTED_IDENTITY_COLUMNS - identity_columns
    if missing_identity_columns:
        raise RuntimeError("Phase 6A identity columns are incomplete.")
    if EXPECTED_APPLICATION_COLUMN not in application_columns:
        raise RuntimeError("Phase 6A application subject hash is missing.")

    print(
        json.dumps(
            {
                "status": "pass",
                "connection": "pooled",
                "revision": revision,
                "phase6_identity_columns": sorted(EXPECTED_IDENTITY_COLUMNS),
                "application_subject_hash": True,
                "external_side_effects_enabled": False,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
