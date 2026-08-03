"""Fail-closed Alembic entrypoint for the dedicated migration job.

The direct database URL is accepted only through process environment and is
never printed. Runtime services use different images and do not contain this
entrypoint or the migration files.
"""

from __future__ import annotations

import os
from urllib.parse import urlsplit

from alembic import command
from alembic.config import Config


def _require_direct_url() -> str:
    direct_url = os.environ.get("DATABASE_URL_UNPOOLED", "").strip()
    if not direct_url:
        raise RuntimeError("DATABASE_URL_UNPOOLED is required for migrations.")

    parsed = urlsplit(direct_url.replace("postgresql+psycopg://", "postgresql://", 1))
    if parsed.scheme != "postgresql" or not parsed.hostname:
        raise RuntimeError("The migration job requires a PostgreSQL direct URL.")
    if "-pooler." in parsed.hostname.lower():
        raise RuntimeError("The migration job refuses pooled database endpoints.")
    if "sslmode=require" not in parsed.query.lower():
        raise RuntimeError("The direct database URL must require TLS.")

    # Settings validates DATABASE_URL as PostgreSQL too. Duplicate the direct
    # value in process memory only when no runtime URL was supplied. This does
    # not add a second Secret Manager binding to the migration job.
    os.environ.setdefault("DATABASE_URL", direct_url)
    return direct_url


def main() -> None:
    _require_direct_url()

    # Import only after the environment is normalized above.
    from app.config import Settings

    settings = Settings()
    settings.validate_for_service("migration")
    command.upgrade(Config("alembic.ini"), "head")
    from scripts.provision_public_rpc_key import provision_public_rpc_key

    provision_public_rpc_key(settings)
    print("migration_status=pass")


if __name__ == "__main__":
    main()
