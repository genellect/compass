"""Verify pre-created Google Groups; optionally record bindings, never share.

Run from services/library-api: python -m scripts.group_catalogue catalogue.json
No OAuth/DB/Drive IDs, email addresses or provider response bodies are printed.
"""
import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import re

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import LibraryAccessGroup, LibraryResourceGroupGrant
from app.db.session import create_database_engine
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.drive_client import GoogleDrivePermissionClient, DriveClientError
from app.groups_client import GoogleGroupsClient


def validate_catalogue(entries):
    if not isinstance(entries, list) or not 1 <= len(entries) <= 100:
        raise ValueError("catalogue must have 1..100 entries")
    identities, cohorts = set(), set()
    for row in entries:
        if not isinstance(row, dict) or set(row) != {"group_name", "group_email", "cohort_key", "shard", "capacity"}:
            raise ValueError("invalid catalogue fields")
        if any(not isinstance(row[field], str) for field in ("group_name", "group_email", "cohort_key")):
            raise ValueError("invalid catalogue value type")
        if not re.fullmatch(r"groups/[A-Za-z0-9_-]+", row["group_name"]):
            raise ValueError("invalid group name")
        if not re.fullmatch(r"(ug|master)-20[0-9]{2}|special-approved", row["cohort_key"]):
            raise ValueError("invalid cohort")
        if not isinstance(row["shard"], int) or isinstance(row["shard"], bool) or row["shard"] < 1:
            raise ValueError("invalid shard")
        if not isinstance(row["capacity"], int) or isinstance(row["capacity"], bool) or not 1 <= row["capacity"] <= 800:
            raise ValueError("invalid capacity")
        if row["group_email"] != row["group_email"].strip().lower() or "@" not in row["group_email"]:
            raise ValueError("group email must be normalized")
        if row["group_name"] in identities or (row["cohort_key"], row["shard"]) in cohorts:
            raise ValueError("duplicate catalogue entry")
        identities.add(row["group_name"])
        cohorts.add((row["cohort_key"], row["shard"]))
    return entries


def verify_and_record(session, entries, groups, drive, resource_id, *, apply=False):
    verified = []
    for row in validate_catalogue(entries):
        groups.verify_group(row["group_name"], row["group_email"])
        permission = drive.find_permission(resource_id, row["group_email"])
        if permission is None or permission.role != "reader" or permission.principal_type != "group":
            raise DriveClientError("group_drive_binding_unverified", retryable=False)
        existing = session.scalar(select(LibraryAccessGroup).where(
            LibraryAccessGroup.google_group_name == row["group_name"]))
        if existing:
            if (existing.group_email, existing.cohort_key, existing.shard, existing.capacity) != (
                row["group_email"], row["cohort_key"], row["shard"], row["capacity"]):
                raise ValueError("existing group configuration differs; no automatic update")
            binding = session.scalar(select(LibraryResourceGroupGrant).where(
                LibraryResourceGroupGrant.group_id == existing.id,
                LibraryResourceGroupGrant.target_alias == DRIVE_TARGET_ALIAS))
            if binding is None or binding.permission_id != permission.permission_id:
                raise ValueError("existing Drive binding differs; no automatic update")
        initial_count = groups.count_members(row["group_name"]) if existing is None else existing.reserved_count
        if initial_count >= row["capacity"]:
            raise ValueError("group has no remaining capacity")
        verified.append((row, existing, permission, initial_count))
    if apply:
        for row, existing, permission, initial_count in verified:
            if existing:
                continue
            group = LibraryAccessGroup(google_group_name=row["group_name"],
                group_email=row["group_email"], cohort_key=row["cohort_key"],
                shard=row["shard"], capacity=row["capacity"], state="ready", reserved_count=initial_count)
            session.add(group)
            session.flush()
            session.add(LibraryResourceGroupGrant(group_id=group.id, target_alias=DRIVE_TARGET_ALIAS,
                permission_id=permission.permission_id, role="reader", verified_at=datetime.now(UTC)))
        session.commit()
    return {"status": "verified", "groups": len(verified), "recorded": apply,
            "drive_permissions_changed": 0, "memberships_changed": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalogue", type=Path)
    parser.add_argument("--apply", action="store_true", help="Insert only new verified catalogue rows")
    parser.add_argument("--approve-production-catalogue", action="store_true")
    args = parser.parse_args()
    engine = None
    try:
        settings = Settings()
        entries = json.loads(args.catalogue.read_text(encoding="utf-8"))
        engine = create_database_engine(settings, migration=True)
        if args.apply and (
            settings.app_env == "production" or engine.url.host not in {None, "localhost", "127.0.0.1"}
        ) and not args.approve_production_catalogue:
            raise SystemExit("Remote catalogue insertion requires explicit operator approval")
        with Session(engine) as session:
            if engine.dialect.name == "postgresql":
                from sqlalchemy import text
                session.execute(text("SET ROLE fsl_migration"))
            result = verify_and_record(session, entries, GoogleGroupsClient(settings),
                GoogleDrivePermissionClient(settings), settings.drive_resource_id, apply=args.apply)
            print(json.dumps(result))
    except (ValueError, OSError, SQLAlchemyError, DriveClientError):
        raise SystemExit("Group verification failed; no completion evidence produced")
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
