from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID
from xml.etree import ElementTree

import pytest

from app.member_export import (
    CSV_CONTENT_TYPE,
    MAX_MEMBER_EXPORT_BYTES,
    MEMBER_EXPORT_COLUMNS,
    MEMBER_EXPORT_SCHEMA_VERSION,
    XLSX_CONTENT_TYPE,
    MemberExportRow,
    build_member_export,
    normalize_export_filters,
    spreadsheet_safe_text,
)


SNAPSHOT = datetime(2026, 8, 1, 8, 9, 10, 123456, tzinfo=timezone.utc)
CREATED = datetime(2026, 7, 1, 1, 2, 3, tzinfo=timezone.utc)
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _row(
    member_id: str = "00000000-0000-0000-0000-000000000002",
    **updates: object,
) -> MemberExportRow:
    values: dict[str, object] = {
        "member_id": UUID(member_id),
        "record_version": 3,
        "full_name": '北里 花子, "研究\n室"',
        "university_email": "hanako@st.kitasato-u.ac.jp",
        "student_number": "PP00123",
        "academic_role": "undergraduate",
        "faculty_code": "pharmacy",
        "grade": "3",
        "roster_grade": "3年",
        "member_status": "active",
        "drive_access_status": "granted",
        "drive_permission_managed": True,
        "created_at_utc": CREATED,
        "registered_at_utc": CREATED,
        "updated_at_utc": CREATED + timedelta(days=1),
        "deactivated_at_utc": None,
    }
    values.update(updates)
    return MemberExportRow(**values)  # type: ignore[arg-type]


def _column(name: str) -> int:
    return [column.key for column in MEMBER_EXPORT_COLUMNS].index(name)


def _xlsx_cell_values(payload: bytes, sheet: str) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        root = ElementTree.fromstring(archive.read(sheet))
    values: list[list[str]] = []
    for row in root.findall(".//x:sheetData/x:row", NS):
        values.append(
            [
                "".join(cell.itertext())
                for cell in row.findall("x:c", NS)
            ]
        )
    return values


def test_csv_is_fixed_order_utf8_bom_crlf_and_deterministic() -> None:
    lower_id = "00000000-0000-0000-0000-000000000001"
    rows = [
        _row(),
        _row(
            lower_id,
            full_name="長い氏名" * 40,
            university_email="second@st.kitasato-u.ac.jp",
            student_number="PL00007",
            grade=None,
            drive_access_status="not_enqueued",
            drive_permission_managed=False,
        ),
    ]

    first = build_member_export(
        rows,
        export_format="csv",
        snapshot_at_utc=SNAPSHOT,
        filters={"academic_role": "undergraduate", "member_status": "active"},
    )
    second = build_member_export(
        reversed(rows),
        export_format="csv",
        snapshot_at_utc=SNAPSHOT,
        filters={"member_status": "active", "academic_role": "undergraduate"},
    )

    assert first.content == second.content
    assert first.content.startswith(b"\xef\xbb\xbf")
    decoded = first.content.decode("utf-8-sig")
    assert "\n" not in decoded.replace("\r\n", "")
    assert "\r" not in decoded.replace("\r\n", "")
    parsed = list(csv.reader(io.StringIO(decoded, newline="")))
    assert parsed[0] == [column.key for column in MEMBER_EXPORT_COLUMNS]
    assert parsed[1][_column("member_id")] == lower_id
    assert parsed[1][_column("student_number")] == "PL00007"
    assert parsed[1][_column("grade")] == ""
    assert parsed[1][_column("drive_permission_managed")] == "false"
    assert parsed[2][_column("full_name")] == '北里 花子, "研究\r\n室"'
    assert first.content_type == CSV_CONTENT_TYPE
    assert first.filename == "library-members-20260801T080910Z.csv"
    assert first.content_disposition == (
        'attachment; filename="library-members-20260801T080910Z.csv"'
    )
    assert first.manifest.row_count == 2
    assert first.manifest.byte_count == len(first.content)
    assert first.manifest.sha256 == hashlib.sha256(first.content).hexdigest()
    assert first.manifest.schema_version == MEMBER_EXPORT_SCHEMA_VERSION
    assert first.manifest.snapshot_at_utc == "2026-08-01T08:09:10.123456Z"
    assert first.manifest.filters == {
        "academic_role": "undergraduate",
        "member_status": "active",
    }


@pytest.mark.parametrize(
    "payload",
    [
        "=1+1",
        "+SUM(A1:A2)",
        "-2+3",
        "@danger",
        "   =HYPERLINK(\"https://invalid.example\")",
        "\t+cmd",
        "\r\n-DDE",
        "\x00@hidden",
        "\x01ordinary-control",
    ],
)
def test_formula_and_control_prefixes_are_inert_for_every_string(payload: str) -> None:
    safe = spreadsheet_safe_text(payload)

    assert safe.startswith("'")
    assert not any(
        ord(character) < 32 and character not in "\t\n\r"
        for character in safe
    )


def test_csv_formula_hardening_applies_after_leading_whitespace() -> None:
    artifact = build_member_export(
        [
            _row(
                full_name="   =2+2",
                university_email="\t+unsafe",
                student_number="@unsafe",
                grade="\r\n-1",
            )
        ],
        export_format="csv",
        snapshot_at_utc=SNAPSHOT,
    )
    parsed = list(
        csv.reader(
            io.StringIO(artifact.content.decode("utf-8-sig"), newline="")
        )
    )

    assert parsed[1][_column("full_name")].startswith("'")
    assert parsed[1][_column("university_email")].startswith("'")
    assert parsed[1][_column("student_number")].startswith("'")
    assert parsed[1][_column("grade")].startswith("'")


def test_unlinked_legacy_email_is_blank_in_csv_and_xlsx() -> None:
    row = _row(university_email=None)
    csv_artifact = build_member_export(
        [row],
        export_format="csv",
        snapshot_at_utc=SNAPSHOT,
    )
    xlsx_artifact = build_member_export(
        [row],
        export_format="xlsx",
        snapshot_at_utc=SNAPSHOT,
    )

    csv_rows = list(
        csv.reader(
            io.StringIO(csv_artifact.content.decode("utf-8-sig"), newline="")
        )
    )
    xlsx_rows = _xlsx_cell_values(
        xlsx_artifact.content,
        "xl/worksheets/sheet1.xml",
    )
    email_column = _column("university_email")
    assert csv_rows[1][email_column] == ""
    assert xlsx_rows[1][email_column] == ""
    assert "None" not in csv_artifact.content.decode("utf-8-sig")


def test_numeric_identifier_leading_zero_is_preserved_by_format() -> None:
    row = _row(student_number="00007")
    csv_artifact = build_member_export(
        [row],
        export_format="csv",
        snapshot_at_utc=SNAPSHOT,
    )
    xlsx_artifact = build_member_export(
        [row],
        export_format="xlsx",
        snapshot_at_utc=SNAPSHOT,
    )
    csv_rows = list(
        csv.reader(
            io.StringIO(csv_artifact.content.decode("utf-8-sig"), newline="")
        )
    )
    xlsx_rows = _xlsx_cell_values(
        xlsx_artifact.content,
        "xl/worksheets/sheet1.xml",
    )

    assert csv_rows[1][_column("student_number")] == "'00007"
    assert xlsx_rows[1][_column("student_number")] == "00007"


def test_xlsx_uses_inline_text_without_formula_cache_or_pii_metadata() -> None:
    row = _row(
        full_name="=malicious-name",
        university_email="private.person@st.kitasato-u.ac.jp",
        student_number="PP00009",
    )
    first = build_member_export(
        [row],
        export_format="xlsx",
        snapshot_at_utc=SNAPSHOT,
        filters={"member_status": "active", "include_inactive": False},
    )
    second = build_member_export(
        [row],
        export_format="xlsx",
        snapshot_at_utc=SNAPSHOT,
        filters={"include_inactive": False, "member_status": "active"},
    )

    assert first.content == second.content
    assert first.content_type == XLSX_CONTENT_TYPE
    assert first.filename == "library-members-20260801T080910Z.xlsx"
    assert first.manifest.sha256 == hashlib.sha256(first.content).hexdigest()
    assert first.manifest.byte_count == len(first.content)

    with zipfile.ZipFile(io.BytesIO(first.content)) as archive:
        names = set(archive.namelist())
        assert "xl/sharedStrings.xml" not in names
        assert not any(name.startswith("docProps/") for name in names)
        assert not any("externalLink" in name for name in names)
        assert not any("vbaProject" in name for name in names)
        assert not any("hyperlink" in name.lower() for name in names)
        for name in names:
            if name.endswith(".xml"):
                xml = archive.read(name)
                root = ElementTree.fromstring(xml)
                assert all(
                    element.tag.rsplit("}", 1)[-1] != "f"
                    for element in root.iter()
                )
        data_sheet = ElementTree.fromstring(
            archive.read("xl/worksheets/sheet1.xml")
        )
        assert data_sheet.find(".//x:pane", NS) is not None
        assert data_sheet.find(".//x:autoFilter", NS) is not None
        cells = data_sheet.findall(".//x:c", NS)
        assert cells
        assert all(cell.attrib["t"] == "inlineStr" for cell in cells)
        assert all(cell.find("x:v", NS) is None for cell in cells)

        non_data_parts = b"\n".join(
            archive.read(name)
            for name in sorted(names)
            if name != "xl/worksheets/sheet1.xml"
        )
        assert "private.person@st.kitasato-u.ac.jp".encode() not in non_data_parts
        assert "=malicious-name".encode() not in non_data_parts
        assert b"PP00009" not in non_data_parts

    rows = _xlsx_cell_values(first.content, "xl/worksheets/sheet1.xml")
    assert rows[0] == [column.key for column in MEMBER_EXPORT_COLUMNS]
    assert rows[1][_column("member_id")] == str(row.member_id)
    assert rows[1][_column("full_name")] == "'=malicious-name"
    assert rows[1][_column("student_number")] == "PP00009"
    assert rows[1][_column("drive_permission_managed")] == "true"

    manifest_rows = _xlsx_cell_values(
        first.content,
        "xl/worksheets/sheet2.xml",
    )
    manifest = dict(manifest_rows[1:])
    assert manifest["schema_version"] == MEMBER_EXPORT_SCHEMA_VERSION
    assert manifest["snapshot_at_utc"] == "2026-08-01T08:09:10.123456Z"
    assert manifest["row_count"] == "1"
    assert json.loads(manifest["filters_json"]) == {
        "include_inactive": False,
        "member_status": "active",
    }
    assert json.loads(manifest["columns_json"]) == [
        column.key for column in MEMBER_EXPORT_COLUMNS
    ]


@pytest.mark.parametrize(
    ("filters", "error"),
    [
        ({"q": "private@st.kitasato-u.ac.jp"}, "export_filter_not_allowed:q"),
        ({"email": "private@st.kitasato-u.ac.jp"}, "export_filter_not_allowed:email"),
        ({"grade": "private@st.kitasato-u.ac.jp"}, "export_filter_value_invalid:grade"),
        ({"member_status": "private-name"}, "export_filter_value_invalid:member_status"),
        ({"include_inactive": "yes"}, "export_filter_value_invalid:include_inactive"),
    ],
)
def test_manifest_filters_reject_pii_and_unknown_values(
    filters: dict[str, object],
    error: str,
) -> None:
    with pytest.raises(ValueError, match=f"^{error}$"):
        normalize_export_filters(filters)


def test_filter_and_row_times_are_canonical_utc() -> None:
    japan = timezone(timedelta(hours=9))
    artifact = build_member_export(
        [
            _row(
                created_at_utc=datetime(2026, 8, 1, 17, 0, tzinfo=japan),
                updated_at_utc=datetime(2026, 8, 1, 17, 1, tzinfo=japan),
            )
        ],
        export_format="csv",
        snapshot_at_utc=datetime(2026, 8, 1, 17, 2, tzinfo=japan),
        filters={
            "created_from_utc": datetime(2026, 8, 1, 17, 0, tzinfo=japan),
        },
    )
    parsed = list(
        csv.reader(
            io.StringIO(artifact.content.decode("utf-8-sig"), newline="")
        )
    )

    assert parsed[1][_column("created_at_utc")] == "2026-08-01T08:00:00.000000Z"
    assert parsed[1][_column("updated_at_utc")] == "2026-08-01T08:01:00.000000Z"
    assert artifact.manifest.snapshot_at_utc == "2026-08-01T08:02:00.000000Z"
    assert artifact.manifest.filters == {
        "created_from_utc": "2026-08-01T08:00:00.000000Z"
    }


def test_naive_timestamp_duplicate_member_and_oversize_export_are_rejected() -> None:
    with pytest.raises(
        ValueError,
        match="^export_timestamp_must_be_timezone_aware$",
    ):
        build_member_export(
            [_row()],
            export_format="csv",
            snapshot_at_utc=datetime(2026, 8, 1),
        )

    duplicate = _row()
    with pytest.raises(ValueError, match="^export_duplicate_member_id$"):
        build_member_export(
            [duplicate, duplicate],
            export_format="csv",
            snapshot_at_utc=SNAPSHOT,
        )

    with pytest.raises(ValueError, match="^export_member_id_invalid$"):
        build_member_export(
            [replace(_row(), member_id="not-a-uuid")],
            export_format="csv",
            snapshot_at_utc=SNAPSHOT,
        )

    with pytest.raises(ValueError, match="^export_row_limit_exceeded$"):
        build_member_export(
            (_row() for _ in range(5_001)),
            export_format="csv",
            snapshot_at_utc=SNAPSHOT,
        )


def test_five_thousand_rows_fit_the_declared_memory_export_boundary() -> None:
    rows = (
        _row(
            f"00000000-0000-0000-0000-{index:012d}",
            university_email=f"synthetic-{index}@st.kitasato-u.ac.jp",
            student_number=f"PP{index:05d}",
        )
        for index in range(1, 5_001)
    )

    artifact = build_member_export(
        rows,
        export_format="xlsx",
        snapshot_at_utc=SNAPSHOT,
        filters={"member_status": "active"},
    )

    assert artifact.manifest.row_count == 5_000
    assert artifact.manifest.byte_count == len(artifact.content)
    assert len(artifact.content) < MAX_MEMBER_EXPORT_BYTES
    assert artifact.manifest.sha256 == hashlib.sha256(artifact.content).hexdigest()
