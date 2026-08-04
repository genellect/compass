from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
from uuid import UUID

from app.member_export import MemberExportRow, build_member_export


SYNTHETIC_SNAPSHOT = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


def _synthetic_rows() -> list[MemberExportRow]:
    shared = {
        "record_version": 1,
        "faculty_code": "pharmacy",
        "member_status": "active",
        "created_at_utc": SYNTHETIC_SNAPSHOT,
        "registered_at_utc": SYNTHETIC_SNAPSHOT,
        "updated_at_utc": SYNTHETIC_SNAPSHOT,
    }
    return [
        MemberExportRow(
            member_id=UUID("00000000-0000-4000-8000-000000000001"),
            full_name="合成 利用者A",
            university_email="synthetic-a@example.invalid",
            student_number="PP23000",
            academic_role="undergraduate",
            grade="3",
            roster_grade="3年",
            drive_access_status="granted",
            drive_permission_managed=True,
            **shared,
        ),
        MemberExportRow(
            member_id=UUID("00000000-0000-4000-8000-000000000002"),
            full_name="=HYPERLINK(\"https://example.invalid\")",
            university_email="synthetic-b@example.invalid",
            student_number="MP24001",
            academic_role="master",
            grade="5",
            roster_grade="その他",
            drive_access_status="already_granted",
            drive_permission_managed=False,
            **shared,
        ),
        MemberExportRow(
            member_id=UUID("00000000-0000-4000-8000-000000000003"),
            full_name="合成 教員C",
            university_email="synthetic-c@example.invalid",
            student_number=None,
            academic_role="staff",
            grade=None,
            roster_grade="その他",
            drive_access_status="pending",
            drive_permission_managed=True,
            **shared,
        ),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a deterministic synthetic Phase 10A XLSX artifact."
    )
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    output = args.output.resolve()
    if output.suffix.lower() != ".xlsx":
        parser.error("--output must use the .xlsx extension")
    if output.exists():
        parser.error("refusing to overwrite an existing artifact")

    artifact = build_member_export(
        _synthetic_rows(),
        export_format="xlsx",
        snapshot_at_utc=SYNTHETIC_SNAPSHOT,
        filters={"member_status": "active"},
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(artifact.content)
    print(json.dumps(artifact.manifest.to_dict(), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
