"""Provision a versioned public-RPC capability digest without logging it."""

from __future__ import annotations

from hashlib import sha256
import hmac
import os
import re

from sqlalchemy import text

from app.config import Settings
from app.db.session import create_database_engine


_KEY_VERSION_PATTERN = re.compile(r"^v[1-9][0-9]*$")


def retirement_confirmation(
    retire_version: str,
    active_version: str,
) -> str:
    """Return the explicit, non-secret confirmation for a staged retirement."""

    return f"retire-{retire_version}-after-{active_version}-ready"


def provision_public_rpc_key(settings: Settings) -> None:
    version = settings.public_registration_rpc_key_version
    token = settings.public_registration_rpc_token
    if not _KEY_VERSION_PATTERN.fullmatch(version):
        raise RuntimeError("A valid public RPC key version is required.")
    token_bytes = token.encode("utf-8")
    if not 32 <= len(token_bytes) <= 512:
        raise RuntimeError("A 32-512 byte public RPC token is required.")
    digest = sha256(token_bytes).digest()

    engine = create_database_engine(settings, migration=True)
    try:
        with engine.begin() as connection:
            if connection.dialect.name != "postgresql":
                return
            connection.exec_driver_sql("SET ROLE fsl_migration")
            existing = connection.execute(
                text(
                    "SELECT token_sha256, active "
                    "FROM fsl_private.public_registration_rpc_keys "
                    "WHERE key_version = :key_version"
                ),
                {"key_version": version},
            ).one_or_none()
            if existing is not None:
                existing_digest = bytes(existing.token_sha256)
                if not existing.active or not hmac.compare_digest(
                    existing_digest,
                    digest,
                ):
                    raise RuntimeError(
                        "The public RPC key version already exists with "
                        "different or retired material. Use a new version."
                    )
                return
            connection.execute(
                text(
                    "INSERT INTO fsl_private.public_registration_rpc_keys ("
                    "key_version, token_sha256, active"
                    ") VALUES (:key_version, :token_sha256, true)"
                ),
                {
                    "key_version": version,
                    "token_sha256": digest,
                },
            )
    finally:
        engine.dispose()


def retire_public_rpc_key(
    settings: Settings,
    *,
    retire_version: str,
    confirmation: str,
) -> None:
    """Retire an old digest only after another version is already active.

    The current deployment version can never retire itself. The row is kept as
    an audit record; no secret material is returned or printed.
    """

    active_version = settings.public_registration_rpc_key_version
    if (
        not _KEY_VERSION_PATTERN.fullmatch(retire_version)
        or retire_version == active_version
        or confirmation
        != retirement_confirmation(retire_version, active_version)
    ):
        raise RuntimeError("Public RPC key retirement was not confirmed.")

    engine = create_database_engine(settings, migration=True)
    try:
        with engine.begin() as connection:
            if connection.dialect.name != "postgresql":
                return
            connection.exec_driver_sql("SET ROLE fsl_migration")
            connection.exec_driver_sql(
                "LOCK TABLE fsl_private.public_registration_rpc_keys "
                "IN SHARE ROW EXCLUSIVE MODE"
            )
            target = connection.execute(
                text(
                    "SELECT active "
                    "FROM fsl_private.public_registration_rpc_keys "
                    "WHERE key_version = :key_version"
                ),
                {"key_version": retire_version},
            ).one_or_none()
            if target is None:
                raise RuntimeError("The requested public RPC key is unknown.")
            if not target.active:
                return
            replacement_ready = connection.execute(
                text(
                    "SELECT EXISTS ("
                    "SELECT 1 "
                    "FROM fsl_private.public_registration_rpc_keys "
                    "WHERE key_version = :active_version "
                    "AND active"
                    ")"
                ),
                {"active_version": active_version},
            ).scalar_one()
            if replacement_ready is not True:
                raise RuntimeError(
                    "The replacement public RPC key is not active."
                )
            connection.execute(
                text(
                    "UPDATE fsl_private.public_registration_rpc_keys "
                    "SET active = false, retired_at = clock_timestamp() "
                    "WHERE key_version = :key_version AND active"
                ),
                {"key_version": retire_version},
            )
    finally:
        engine.dispose()


def main() -> None:
    settings = Settings()
    provision_public_rpc_key(settings)
    retire_version = os.environ.get(
        "PUBLIC_REGISTRATION_RPC_RETIRE_VERSION",
        "",
    ).strip()
    if retire_version:
        retire_public_rpc_key(
            settings,
            retire_version=retire_version,
            confirmation=os.environ.get(
                "PUBLIC_REGISTRATION_RPC_RETIRE_CONFIRMATION",
                "",
            ),
        )
        print("public_rpc_key_rotation=pass")
    else:
        print("public_rpc_key_provision=pass")


if __name__ == "__main__":
    main()
