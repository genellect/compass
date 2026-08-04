"""Private Phase 9 legacy snapshot migration command.

This module never calls Google, Drive, Gmail, or a public upload endpoint. The
operator first exports four read-only CSV snapshots into one protected local
directory, prepares a byte-level manifest, stages a dry run, and explicitly
approves the pinned hashes before apply. Raw rows are never printed.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import csv
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import LibraryImportBatch
from app.db.session import create_database_engine
from app.legacy_import import (
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


SOURCE_FILES = {
    "google_form": "google-form.csv",
    "management_sheet": "management-sheet.csv",
    "member_roster": "member-roster.csv",
    "drive_permission": "drive-permissions.csv",
}
MANIFEST_FILENAME = "snapshot-manifest.json"
APPLY_CONFIRMATION = "APPLY_APPROVED_BATCH_WITHOUT_DRIVE_SIDE_EFFECTS"
PURGE_CONFIRMATION = "PURGE_EXPIRED_TERMINAL_RAW_SNAPSHOTS"
MANIFEST_VERSION = "phase9-snapshot-manifest-v2"
ROW_REPORT_FILENAME = "phase9-row-reconciliation.json"
REQUIRED_HEADERS = {
    "google_form": {
        "氏名",
        "学年",
        "学籍番号",
        "自動収集メール",
        "入力大学メール",
        "利用規約",
        "個人情報",
    },
    "management_sheet": {
        "処理日時",
        "氏名",
        "学年",
        "学籍番号",
        "自動収集メール",
        "入力メール",
        "招待対象メール",
        "判定結果",
        "判定理由",
        "共有ドライブ処理",
        "申請者メール",
        "管理者メール",
        "エラー詳細",
        "申請種別",
        "連絡先メール",
        "問い合わせ内容",
        "利用規約回答",
        "個人情報回答",
    },
    "member_roster": {"氏名", "学籍番号", "学年"},
    "drive_permission": {"id", "emailAddress", "role", "type"},
}


class Phase9CliError(RuntimeError):
    pass


def _json_print(value: object) -> None:
    print(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2))


def _parse_utc(value: str) -> datetime:
    normalized = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise Phase9CliError("reference time must include an explicit UTC offset")
    return parsed.astimezone(UTC)


def _safe_bundle_file(bundle_dir: Path, filename: str) -> Path:
    if not filename or Path(filename).name != filename:
        raise Phase9CliError("manifest source path must be a plain filename")
    root = bundle_dir.resolve()
    target = (root / filename).resolve()
    if target.parent != root:
        raise Phase9CliError("manifest source path escapes the bundle directory")
    return target


def _csv_snapshot(path: Path) -> tuple[bytes, list[str], list[dict[str, str]]]:
    try:
        content = path.read_bytes()
    except OSError as error:
        raise Phase9CliError(f"snapshot file unavailable: {path.name}") from error
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise Phase9CliError(
            f"snapshot must be UTF-8 CSV: {path.name}"
        ) from error
    reader = csv.DictReader(text.splitlines(keepends=True))
    headers = list(reader.fieldnames or [])
    if not headers or any(not header for header in headers):
        raise Phase9CliError(f"snapshot header is missing or empty: {path.name}")
    if len(headers) != len(set(headers)):
        raise Phase9CliError(f"snapshot contains duplicate headers: {path.name}")
    try:
        rows = [dict(row) for row in reader]
    except csv.Error as error:
        raise Phase9CliError(f"snapshot CSV is malformed: {path.name}") from error
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise Phase9CliError(f"snapshot row width is invalid: {path.name}")
    return content, headers, rows


def _validate_required_headers(source_system: str, headers: list[str]) -> None:
    missing = sorted(REQUIRED_HEADERS[source_system] - set(headers))
    if missing:
        raise Phase9CliError(
            f"snapshot required headers are invalid: {source_system}"
        )


def prepare_manifest(
    bundle_dir: Path,
    *,
    reference_at: datetime,
    fingerprint_key_version: str,
    drive_resource_id: str,
    fingerprint_key: bytes,
    raw_snapshot_retention_days: int = 90,
    overwrite: bool = False,
) -> Path:
    bundle_dir = bundle_dir.resolve()
    output = bundle_dir / MANIFEST_FILENAME
    if output.exists() and not overwrite:
        raise Phase9CliError(
            "snapshot-manifest.json already exists; refuse implicit overwrite"
        )
    sources: dict[str, dict[str, Any]] = {}
    for source_system, filename in SOURCE_FILES.items():
        content, headers, rows = _csv_snapshot(
            _safe_bundle_file(bundle_dir, filename)
        )
        _validate_required_headers(source_system, headers)
        sources[source_system] = {
            "filename": filename,
            "content_sha256": hashlib.sha256(content).hexdigest(),
            "byte_count": len(content),
            "row_count": len(rows),
            "headers": headers,
        }
    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "schema_version": "legacy-v2",
        "normalization_rule_version": "phase9-v2",
        "fingerprint_key_version": fingerprint_key_version.strip(),
        "target_drive_resource_fingerprint": drive_resource_fingerprint(
            fingerprint_key,
            drive_resource_id,
        ),
        "raw_snapshot_retention_days": raw_snapshot_retention_days,
        "reference_at_utc": reference_at.astimezone(UTC).isoformat(),
        "sources": sources,
    }
    if not manifest["fingerprint_key_version"]:
        raise Phase9CliError("fingerprint key version is required")
    if not 1 <= raw_snapshot_retention_days <= 3650:
        raise Phase9CliError(
            "raw snapshot retention must be between 1 and 3650 days"
        )
    output.write_text(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return output


def load_bundle(
    bundle_dir: Path,
) -> tuple[dict[str, Any], dict[str, LegacySnapshotSource]]:
    bundle_dir = bundle_dir.resolve()
    manifest_path = bundle_dir / MANIFEST_FILENAME
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise Phase9CliError("valid snapshot-manifest.json is required") from error
    if manifest.get("manifest_version") != MANIFEST_VERSION:
        raise Phase9CliError("snapshot manifest version is unsupported")
    definitions = manifest.get("sources")
    if not isinstance(definitions, dict) or set(definitions) != set(SOURCE_FILES):
        raise Phase9CliError("manifest must contain all four source systems")

    sources: dict[str, LegacySnapshotSource] = {}
    for source_system in SOURCE_FILES:
        definition = definitions[source_system]
        if not isinstance(definition, dict):
            raise Phase9CliError("manifest source definition is invalid")
        filename = definition.get("filename")
        if not isinstance(filename, str):
            raise Phase9CliError("manifest source filename is invalid")
        content, headers, rows = _csv_snapshot(
            _safe_bundle_file(bundle_dir, filename)
        )
        _validate_required_headers(source_system, headers)
        actual_hash = hashlib.sha256(content).hexdigest()
        if actual_hash != definition.get("content_sha256"):
            raise Phase9CliError(
                f"snapshot hash changed after manifest: {source_system}"
            )
        if len(content) != definition.get("byte_count"):
            raise Phase9CliError(
                f"snapshot byte count changed after manifest: {source_system}"
            )
        if headers != definition.get("headers"):
            raise Phase9CliError(
                f"snapshot headers changed after manifest: {source_system}"
            )
        if len(rows) != definition.get("row_count"):
            raise Phase9CliError(
                f"snapshot row count changed after manifest: {source_system}"
            )
        sources[source_system] = LegacySnapshotSource(
            snapshot_bytes=content,
            rows=[
                LegacySourceRow(
                    # CSV row 1 is the header. Preserve the source row number.
                    source_row_number=index + 2,
                    source_payload=row,
                )
                for index, row in enumerate(rows)
            ],
        )
    resource_fingerprint = manifest.get("target_drive_resource_fingerprint")
    if (
        not isinstance(resource_fingerprint, str)
        or len(resource_fingerprint) != 64
        or any(character not in "0123456789abcdef" for character in resource_fingerprint)
    ):
        raise Phase9CliError("target Drive resource fingerprint is invalid")
    retention_days = manifest.get("raw_snapshot_retention_days")
    if not isinstance(retention_days, int) or not 1 <= retention_days <= 3650:
        raise Phase9CliError("raw snapshot retention is invalid")
    return manifest, sources


def _fingerprint_key() -> bytes:
    encoded = os.environ.get("PHASE9_FINGERPRINT_HMAC_KEY_B64", "").strip()
    if not encoded:
        raise Phase9CliError("PHASE9_FINGERPRINT_HMAC_KEY_B64 is required")
    try:
        key = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise Phase9CliError(
            "PHASE9_FINGERPRINT_HMAC_KEY_B64 must be valid base64"
        ) from error
    if len(key) < 32:
        raise Phase9CliError("Phase 9 HMAC key must decode to at least 32 bytes")
    return key


def _env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise Phase9CliError(f"{name} is required")
    return value


def _batch(session: Session, batch_id: UUID) -> LibraryImportBatch:
    batch = session.get(LibraryImportBatch, batch_id)
    if batch is None:
        raise Phase9CliError("legacy import batch was not found")
    return batch


def _status_payload(batch: LibraryImportBatch) -> dict[str, Any]:
    # Deliberately excludes source_payload, normalized PII, row fingerprints,
    # approval key, administrator identity, and Drive permission identifiers.
    apply_status_counts = {
        status: sum(1 for row in batch.rows if row.apply_status == status)
        for status in ("pending", "applied", "skipped", "rolled_back")
    }
    return {
        "batch_id": str(batch.id),
        "status": batch.status,
        "record_version": batch.record_version,
        "schema_version": batch.schema_version,
        "normalization_rule_version": batch.normalization_rule_version,
        "fingerprint_key_version": batch.fingerprint_key_version,
        "reference_at": batch.reference_at.isoformat(),
        "source_hash": batch.source_hash,
        "dry_run_hash": batch.dry_run_hash,
        "target_drive_resource_fingerprint": (
            batch.target_drive_resource_fingerprint
        ),
        "staged_normalized_hash": batch.staged_normalized_hash,
        "approved_normalized_hash": batch.approved_normalized_hash,
        "row_count": batch.row_count,
        "apply_status_counts": apply_status_counts,
        "apply_status_count_matches_rows": (
            sum(apply_status_counts.values()) == batch.row_count
        ),
        "lineage_counts": {
            "members_created_by_batch": sum(
                1 for row in batch.rows if row.member_created_by_batch
            ),
            "access_grants_created_by_batch": sum(
                1 for row in batch.rows if row.access_grant_created_by_batch
            ),
        },
        "report": batch.dry_run_report_json,
        "approved_at": (
            batch.approved_at.isoformat() if batch.approved_at else None
        ),
        "applied_at": batch.applied_at.isoformat() if batch.applied_at else None,
        "rolled_back_at": (
            batch.rolled_back_at.isoformat() if batch.rolled_back_at else None
        ),
        "raw_snapshot_expires_at": (
            batch.raw_snapshot_expires_at.isoformat()
            if batch.raw_snapshot_expires_at
            else None
        ),
        "raw_snapshot_retention_days": batch.dry_run_report_json.get(
            "raw_snapshot_retention_days"
        ),
        "raw_purged_at": (
            batch.raw_purged_at.isoformat() if batch.raw_purged_at else None
        ),
        "legal_hold": batch.legal_hold,
        "operational_side_effects": False,
    }


def write_row_reconciliation_report(
    batch: LibraryImportBatch,
    bundle_dir: Path,
) -> Path:
    """Write the protected, non-PII, row-level operator artifact once."""

    bundle_dir = bundle_dir.resolve()
    if not bundle_dir.is_dir():
        raise Phase9CliError("row report bundle directory is unavailable")
    output = _safe_bundle_file(bundle_dir, ROW_REPORT_FILENAME)
    rows = [
        {
            "source_system": row.source_system,
            "source_row_number": row.source_row_number,
            "source_row_fingerprint": row.source_row_fingerprint,
            "classification": row.classification,
            "issue_codes": sorted(row.error_codes),
            "apply_status": row.apply_status,
        }
        for row in sorted(
            batch.rows,
            key=lambda item: (
                item.source_system,
                item.source_row_number,
                item.source_row_fingerprint,
            ),
        )
    ]
    artifact = {
        "artifact_version": "phase9-row-reconciliation-v1",
        "batch_id": str(batch.id),
        "source_hash": batch.source_hash,
        "target_drive_resource_fingerprint": (
            batch.target_drive_resource_fingerprint
        ),
        "staged_normalized_hash": batch.staged_normalized_hash,
        "approved_normalized_hash": batch.approved_normalized_hash,
        "row_count": batch.row_count,
        "reported_row_count": len(rows),
        "row_count_matches": len(rows) == batch.row_count,
        "contains_direct_pii": False,
        "rows": rows,
    }
    try:
        descriptor = os.open(
            output,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(
            descriptor,
            "w",
            encoding="utf-8",
            newline="\n",
        ) as handle:
            json.dump(
                artifact,
                handle,
                ensure_ascii=False,
                sort_keys=True,
                indent=2,
            )
            handle.write("\n")
    except FileExistsError as error:
        raise Phase9CliError(
            "phase9-row-reconciliation.json already exists; refuse overwrite"
        ) from error
    except OSError as error:
        raise Phase9CliError("row report could not be written") from error
    return output


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Private, no-Drive-side-effect Phase 9 migration job"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare-manifest")
    prepare.add_argument("bundle_dir", type=Path)
    prepare.add_argument("--reference-at", required=True)
    prepare.add_argument("--fingerprint-key-version", required=True)
    prepare.add_argument("--raw-retention-days", type=int, default=90)
    prepare.add_argument("--overwrite", action="store_true")
    stage = commands.add_parser("stage")
    stage.add_argument("bundle_dir", type=Path)
    for name in (
        "status",
        "approve",
        "reject",
        "apply",
        "rollback",
        "hold",
        "unhold",
    ):
        command = commands.add_parser(name)
        command.add_argument("batch_id", type=UUID)
    row_report = commands.add_parser("row-report")
    row_report.add_argument("batch_id", type=UUID)
    row_report.add_argument("bundle_dir", type=Path)
    purge = commands.add_parser("purge-expired")
    purge.add_argument("--now", default=datetime.now(UTC).isoformat())
    return parser


def _run_database_command(arguments: argparse.Namespace) -> dict[str, Any]:
    settings = get_settings()
    settings.validate_for_service("migration")
    engine = create_database_engine(settings, migration=True)
    try:
        with Session(engine, expire_on_commit=False) as session:
            if arguments.command == "stage":
                manifest, sources = load_bundle(arguments.bundle_dir)
                result = stage_legacy_snapshot(
                    session,
                    reference_at=_parse_utc(manifest["reference_at_utc"]),
                    sources=sources,
                    fingerprint_key=_fingerprint_key(),
                    fingerprint_key_version=manifest[
                        "fingerprint_key_version"
                    ],
                    drive_resource_id=_env("PHASE9_DRIVE_RESOURCE_ID"),
                    expected_drive_resource_fingerprint=manifest[
                        "target_drive_resource_fingerprint"
                    ],
                    schema_version=manifest["schema_version"],
                    normalization_rule_version=manifest[
                        "normalization_rule_version"
                    ],
                    raw_snapshot_retention_days=manifest[
                        "raw_snapshot_retention_days"
                    ],
                )
                return {
                    "batch_id": str(result.batch_id),
                    "status": result.status,
                    "replayed": result.replayed,
                    "report": result.report,
                    "operational_side_effects": False,
                }

            batch = _batch(session, arguments.batch_id)
            if arguments.command == "status":
                return _status_payload(batch)
            if arguments.command == "row-report":
                output = write_row_reconciliation_report(
                    batch,
                    arguments.bundle_dir,
                )
                return {
                    "status": "written",
                    "artifact": output.name,
                    "row_count": batch.row_count,
                    "contains_direct_pii": False,
                }

            admin_id = UUID(_env("PHASE9_ADMIN_ID"))
            reason = _env("PHASE9_REASON")
            if arguments.command == "approve":
                if _env("PHASE9_CONFIRMED_SOURCE_HASH") != batch.source_hash:
                    raise Phase9CliError("confirmed source hash does not match")
                if _env("PHASE9_CONFIRMED_REPORT_HASH") != batch.dry_run_hash:
                    raise Phase9CliError("confirmed dry-run hash does not match")
                if (
                    _env("PHASE9_CONFIRMED_NORMALIZED_HASH")
                    != batch.staged_normalized_hash
                ):
                    raise Phase9CliError(
                        "confirmed normalized hash does not match"
                    )
                if (
                    _env("PHASE9_CONFIRMED_DRIVE_RESOURCE_FINGERPRINT")
                    != batch.target_drive_resource_fingerprint
                ):
                    raise Phase9CliError(
                        "confirmed Drive resource fingerprint does not match"
                    )
                result = approve_legacy_import(
                    session,
                    batch.id,
                    approved_by_admin_id=admin_id,
                    reason=reason,
                    idempotency_key=_env("PHASE9_IDEMPOTENCY_KEY"),
                    fingerprint_key=_fingerprint_key(),
                )
                return {
                    "batch_id": str(result.batch_id),
                    "status": result.status,
                    "replayed": result.replayed,
                    "record_version": result.record_version,
                }
            if arguments.command == "reject":
                rejected = reject_legacy_import(
                    session,
                    batch.id,
                    rejected_by_admin_id=admin_id,
                    reason=reason,
                )
                return _status_payload(rejected)
            if arguments.command == "apply":
                if _env("PHASE9_APPLY_CONFIRM") != APPLY_CONFIRMATION:
                    raise Phase9CliError("Phase 9 apply confirmation is missing")
                if _env("PHASE9_CONFIRMED_SOURCE_HASH") != batch.source_hash:
                    raise Phase9CliError("approved source hash does not match")
                result = apply_legacy_import(
                    session,
                    batch.id,
                    drive_resource_id=_env("PHASE9_DRIVE_RESOURCE_ID"),
                    fingerprint_key=_fingerprint_key(),
                )
                return {
                    **result.__dict__,
                    "batch_id": str(result.batch_id),
                    "operational_side_effects": False,
                }
            if arguments.command == "rollback":
                if _env("PHASE9_ROLLBACK_CONFIRM") != str(batch.id):
                    raise Phase9CliError("Phase 9 rollback confirmation is missing")
                result = rollback_legacy_import(
                    session,
                    batch.id,
                    rolled_back_by_admin_id=admin_id,
                    reason=reason,
                    fingerprint_key=_fingerprint_key(),
                )
                return {
                    **result.__dict__,
                    "batch_id": str(result.batch_id),
                    "operational_side_effects": False,
                }
            if arguments.command in {"hold", "unhold"}:
                result = set_legacy_import_legal_hold(
                    session,
                    batch.id,
                    admin_id=admin_id,
                    enabled=arguments.command == "hold",
                    reason=reason,
                    idempotency_key=_env("PHASE9_IDEMPOTENCY_KEY"),
                )
                return {
                    "batch_id": str(result.batch_id),
                    "status": "completed",
                    "legal_hold": result.legal_hold,
                    "replayed": result.replayed,
                    "record_version": result.record_version,
                }
            raise Phase9CliError("unsupported Phase 9 command")
    finally:
        engine.dispose()


def main() -> int:
    arguments = _parser().parse_args()
    try:
        if arguments.command == "prepare-manifest":
            output = prepare_manifest(
                arguments.bundle_dir,
                reference_at=_parse_utc(arguments.reference_at),
                fingerprint_key_version=arguments.fingerprint_key_version,
                drive_resource_id=_env("PHASE9_DRIVE_RESOURCE_ID"),
                fingerprint_key=_fingerprint_key(),
                raw_snapshot_retention_days=arguments.raw_retention_days,
                overwrite=arguments.overwrite,
            )
            _json_print(
                {
                    "status": "prepared",
                    "manifest": output.name,
                    "contains_pii": False,
                }
            )
            return 0
        if arguments.command == "purge-expired":
            if _env("PHASE9_PURGE_CONFIRM") != PURGE_CONFIRMATION:
                raise Phase9CliError("Phase 9 purge confirmation is missing")
            settings = get_settings()
            settings.validate_for_service("migration")
            engine = create_database_engine(settings, migration=True)
            try:
                with Session(engine) as session:
                    purged = purge_expired_legacy_snapshots(
                        session,
                        now=_parse_utc(arguments.now),
                        admin_id=UUID(_env("PHASE9_ADMIN_ID")),
                        reason=_env("PHASE9_REASON"),
                        idempotency_key=_env("PHASE9_IDEMPOTENCY_KEY"),
                    )
            finally:
                engine.dispose()
            _json_print({"status": "completed", "purged_batches": purged})
            return 0
        _json_print(_run_database_command(arguments))
        return 0
    except SQLAlchemyError:
        _json_print({"status": "error", "code": "database_operation_failed"})
        return 2
    except (Phase9CliError, ValueError, RuntimeError) as error:
        # All service errors are stable codes/messages; raw rows are never
        # interpolated into exceptions or printed here.
        _json_print({"status": "error", "code": str(error)})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
