from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import zipfile
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, TypeAlias
from uuid import UUID
from xml.sax.saxutils import escape


MEMBER_EXPORT_SCHEMA_VERSION = "library-members-v2"
MAX_MEMBER_EXPORT_ROWS = 5_000
MAX_MEMBER_EXPORT_BYTES = 25 * 1024 * 1024

CSV_CONTENT_TYPE = "text/csv; charset=utf-8"
XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

ExportFormat: TypeAlias = Literal["csv", "xlsx"]
FilterValue: TypeAlias = str | bool


@dataclass(frozen=True, slots=True)
class ExportColumn:
    key: str
    width: float


MEMBER_EXPORT_COLUMNS: tuple[ExportColumn, ...] = (
    ExportColumn("full_name", 28),
    ExportColumn("roster_grade", 14),
    ExportColumn("student_number", 18),
    ExportColumn("registered_at_utc", 28),
    ExportColumn("member_id", 38),
    ExportColumn("record_version", 16),
    ExportColumn("university_email", 38),
    ExportColumn("academic_role", 18),
    ExportColumn("faculty_code", 18),
    ExportColumn("grade", 12),
    ExportColumn("member_status", 18),
    ExportColumn("drive_access_status", 22),
    ExportColumn("drive_permission_managed", 27),
    ExportColumn("created_at_utc", 28),
    ExportColumn("updated_at_utc", 28),
    ExportColumn("deactivated_at_utc", 28),
)


@dataclass(frozen=True, slots=True)
class MemberExportRow:
    """The complete, fixed v2 roster row selected by a server-side snapshot."""

    member_id: UUID | str
    record_version: int
    full_name: str
    university_email: str | None
    student_number: str | None
    academic_role: str
    faculty_code: str
    grade: str | None
    roster_grade: str
    member_status: str
    drive_access_status: str
    drive_permission_managed: bool
    created_at_utc: datetime
    registered_at_utc: datetime | None
    updated_at_utc: datetime
    deactivated_at_utc: datetime | None = None


@dataclass(frozen=True, slots=True)
class ExportManifest:
    schema_version: str
    columns: tuple[str, ...]
    snapshot_at_utc: str
    filters: Mapping[str, FilterValue]
    row_count: int
    byte_count: int
    sha256: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "columns": list(self.columns),
            "snapshot_at_utc": self.snapshot_at_utc,
            "filters": dict(self.filters),
            "row_count": self.row_count,
            "byte_count": self.byte_count,
            "sha256": self.sha256,
        }


@dataclass(frozen=True, slots=True)
class ExportArtifact:
    content: bytes
    content_type: str
    filename: str
    manifest: ExportManifest

    @property
    def content_disposition(self) -> str:
        return f'attachment; filename="{self.filename}"'


_MEMBER_STATUSES = frozenset({"active", "pending_review", "inactive", "all"})
_ACADEMIC_ROLES = frozenset(
    {"undergraduate", "master", "doctoral", "staff"}
)
_FACULTY_CODES = frozenset({"pharmacy", "other"})
_GRADES = frozenset({"1", "2", "3", "4", "5", "6"})
_DRIVE_STATUSES = frozenset(
    {
        "not_enqueued",
        "pending",
        "granted",
        "already_granted",
        "failed",
        "revoked",
    }
)
_ENUM_FILTERS: Mapping[str, frozenset[str]] = {
    "member_status": _MEMBER_STATUSES,
    "academic_role": _ACADEMIC_ROLES,
    "faculty_code": _FACULTY_CODES,
    "grade": _GRADES,
    "drive_access_status": _DRIVE_STATUSES,
}
_BOOLEAN_FILTERS = frozenset({"include_inactive", "drive_permission_managed"})
_UTC_FILTERS = frozenset({"created_from_utc", "created_to_utc"})
_ALLOWED_FILTERS = frozenset(_ENUM_FILTERS) | _BOOLEAN_FILTERS | _UTC_FILTERS

_INVALID_XML_CONTROLS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_FORMULA_PREFIXES = frozenset("=+-@")
_FIXED_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def normalize_export_filters(
    filters: Mapping[str, object] | None,
) -> dict[str, FilterValue]:
    """Return deterministic, non-PII filter metadata for an export run.

    Free-text, email, name, student-number and unknown filters are deliberately
    rejected.  Such values may be valid search inputs, but must not be copied to
    export metadata or audit records.
    """

    normalized: dict[str, FilterValue] = {}
    for key, value in (filters or {}).items():
        if key not in _ALLOWED_FILTERS:
            raise ValueError(f"export_filter_not_allowed:{key}")
        if value is None:
            continue
        if key in _ENUM_FILTERS:
            if not isinstance(value, str) or value not in _ENUM_FILTERS[key]:
                raise ValueError(f"export_filter_value_invalid:{key}")
            normalized[key] = value
        elif key in _BOOLEAN_FILTERS:
            if not isinstance(value, bool):
                raise ValueError(f"export_filter_value_invalid:{key}")
            normalized[key] = value
        else:
            if not isinstance(value, datetime):
                raise ValueError(f"export_filter_value_invalid:{key}")
            normalized[key] = _format_utc(value)
    return dict(sorted(normalized.items()))


def spreadsheet_safe_text(value: object | None) -> str:
    """Convert a value to inert spreadsheet text for every exported cell.

    An apostrophe is added when a formula marker follows any leading whitespace
    or control character.  Leading control characters are also disarmed on
    their own.  XML-forbidden controls are replaced rather than written into
    CSV/XLSX payloads, and line endings are normalized before format rendering.
    """

    if value is None:
        return ""
    if isinstance(value, bool):
        raw = "true" if value else "false"
    else:
        raw = str(value)

    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    leading_control = bool(raw) and _is_ascii_control(raw[0])
    index = 0
    while index < len(raw) and (
        raw[index].isspace() or _is_ascii_control(raw[index])
    ):
        index += 1
    formula_like = index < len(raw) and raw[index] in _FORMULA_PREFIXES

    safe = _INVALID_XML_CONTROLS.sub("\ufffd", raw)
    if leading_control or formula_like:
        safe = "'" + safe
    return safe


def build_member_export(
    rows: Iterable[MemberExportRow | Mapping[str, object]],
    *,
    export_format: ExportFormat,
    snapshot_at_utc: datetime,
    filters: Mapping[str, object] | None = None,
) -> ExportArtifact:
    """Build one deterministic, memory-only CSV or XLSX roster snapshot."""

    if export_format not in ("csv", "xlsx"):
        raise ValueError("export_format_not_supported")

    snapshot_text = _format_utc(snapshot_at_utc)
    normalized_filters = normalize_export_filters(filters)
    normalized_rows: list[tuple[str, ...]] = []
    for row in rows:
        if len(normalized_rows) >= MAX_MEMBER_EXPORT_ROWS:
            raise ValueError("export_row_limit_exceeded")
        normalized_rows.append(_normalize_row(row))

    member_id_column = tuple(column.key for column in MEMBER_EXPORT_COLUMNS).index(
        "member_id"
    )
    grade_order = {
        label: index
        for index, label in enumerate(
            ("1年", "2年", "3年", "4年", "5年", "6年", "M1", "M2", "その他")
        )
    }
    normalized_rows.sort(
        key=lambda item: (
            grade_order.get(item[1], len(grade_order)),
            item[2] == "",
            item[2],
            item[3] == "",
            item[3],
            item[member_id_column],
        )
    )
    identifiers = [item[member_id_column] for item in normalized_rows]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("export_duplicate_member_id")

    columns = tuple(column.key for column in MEMBER_EXPORT_COLUMNS)
    if export_format == "csv":
        content = _render_csv(normalized_rows, columns)
        content_type = CSV_CONTENT_TYPE
    else:
        content = _render_xlsx(
            normalized_rows,
            columns,
            snapshot_at_utc=snapshot_text,
            filters=normalized_filters,
        )
        content_type = XLSX_CONTENT_TYPE

    if len(content) > MAX_MEMBER_EXPORT_BYTES:
        raise ValueError("export_byte_limit_exceeded")

    digest = hashlib.sha256(content).hexdigest()
    filename_timestamp = snapshot_at_utc.astimezone(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    manifest = ExportManifest(
        schema_version=MEMBER_EXPORT_SCHEMA_VERSION,
        columns=columns,
        snapshot_at_utc=snapshot_text,
        filters=normalized_filters,
        row_count=len(normalized_rows),
        byte_count=len(content),
        sha256=digest,
    )
    return ExportArtifact(
        content=content,
        content_type=content_type,
        filename=f"library-members-{filename_timestamp}.{export_format}",
        manifest=manifest,
    )


def _normalize_row(
    row: MemberExportRow | Mapping[str, object],
) -> tuple[str, ...]:
    if isinstance(row, Mapping):
        try:
            row = MemberExportRow(
                member_id=row["member_id"],  # type: ignore[arg-type]
                record_version=row["record_version"],  # type: ignore[arg-type]
                full_name=row["full_name"],  # type: ignore[arg-type]
                university_email=row["university_email"],  # type: ignore[arg-type]
                student_number=row.get("student_number"),  # type: ignore[arg-type]
                academic_role=row["academic_role"],  # type: ignore[arg-type]
                faculty_code=row["faculty_code"],  # type: ignore[arg-type]
                grade=row.get("grade"),  # type: ignore[arg-type]
                roster_grade=row["roster_grade"],  # type: ignore[arg-type]
                member_status=row["member_status"],  # type: ignore[arg-type]
                drive_access_status=row["drive_access_status"],  # type: ignore[arg-type]
                drive_permission_managed=row[  # type: ignore[arg-type]
                    "drive_permission_managed"
                ],
                created_at_utc=row["created_at_utc"],  # type: ignore[arg-type]
                registered_at_utc=row.get("registered_at_utc"),  # type: ignore[arg-type]
                updated_at_utc=row["updated_at_utc"],  # type: ignore[arg-type]
                deactivated_at_utc=row.get("deactivated_at_utc"),  # type: ignore[arg-type]
            )
        except KeyError as exc:
            raise ValueError(f"export_row_field_missing:{exc.args[0]}") from exc

    try:
        member_id = str(UUID(str(row.member_id)))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("export_member_id_invalid") from exc
    if not isinstance(row.record_version, int) or isinstance(
        row.record_version, bool
    ) or row.record_version < 1:
        raise ValueError("export_record_version_invalid")
    if not isinstance(row.drive_permission_managed, bool):
        raise ValueError("export_drive_permission_managed_invalid")

    values: tuple[object | None, ...] = (
        row.full_name,
        row.roster_grade,
        row.student_number,
        _format_utc(row.registered_at_utc)
        if row.registered_at_utc is not None
        else None,
        member_id,
        row.record_version,
        row.university_email,
        row.academic_role,
        row.faculty_code,
        row.grade,
        row.member_status,
        row.drive_access_status,
        row.drive_permission_managed,
        _format_utc(row.created_at_utc),
        _format_utc(row.updated_at_utc),
        _format_utc(row.deactivated_at_utc)
        if row.deactivated_at_utc is not None
        else None,
    )
    normalized = tuple(spreadsheet_safe_text(value) for value in values)
    if any(len(value) > 32_767 for value in normalized):
        raise ValueError("export_cell_length_exceeded")
    return normalized


def _render_csv(rows: list[tuple[str, ...]], columns: tuple[str, ...]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        # Keep all CSV record and embedded cell line endings in CRLF form.
        writer.writerow(
            tuple(
                _csv_text(value, column).replace("\n", "\r\n")
                for column, value in zip(columns, row, strict=True)
            )
        )
    return output.getvalue().encode("utf-8-sig")


def _csv_text(value: str, column: str) -> str:
    # CSV has no cell type.  An apostrophe prevents Excel from collapsing an
    # all-numeric identifier's leading zero; XLSX does not need this because
    # every exported cell is explicitly encoded as inline text.
    if column in {"member_id", "student_number"} and re.fullmatch(
        r"0\d+", value
    ):
        return "'" + value
    return value


def _render_xlsx(
    rows: list[tuple[str, ...]],
    columns: tuple[str, ...],
    *,
    snapshot_at_utc: str,
    filters: Mapping[str, FilterValue],
) -> bytes:
    manifest_rows = (
        ("schema_version", MEMBER_EXPORT_SCHEMA_VERSION),
        ("snapshot_at_utc", snapshot_at_utc),
        ("row_count", str(len(rows))),
        (
            "filters_json",
            json.dumps(
                filters,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ),
        ),
        (
            "columns_json",
            json.dumps(columns, ensure_ascii=False, separators=(",", ":")),
        ),
    )
    parts: tuple[tuple[str, str], ...] = (
        ("[Content_Types].xml", _content_types_xml()),
        ("_rels/.rels", _root_relationships_xml()),
        ("xl/workbook.xml", _workbook_xml()),
        ("xl/_rels/workbook.xml.rels", _workbook_relationships_xml()),
        ("xl/styles.xml", _styles_xml()),
        (
            "xl/worksheets/sheet1.xml",
            _worksheet_xml(
                (columns, *rows),
                widths=tuple(column.width for column in MEMBER_EXPORT_COLUMNS),
                freeze_header=True,
                auto_filter=True,
            ),
        ),
        (
            "xl/worksheets/sheet2.xml",
            _worksheet_xml(
                (("key", "value"), *manifest_rows),
                widths=(24, 100),
                freeze_header=True,
                auto_filter=False,
            ),
        ),
    )

    output = io.BytesIO()
    with zipfile.ZipFile(
        output,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for name, payload in parts:
            info = zipfile.ZipInfo(name, date_time=_FIXED_ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            info.external_attr = 0
            archive.writestr(info, payload.encode("utf-8"))
    return output.getvalue()


def _worksheet_xml(
    rows: Iterable[tuple[str, ...]],
    *,
    widths: tuple[float, ...],
    freeze_header: bool,
    auto_filter: bool,
) -> str:
    materialized = tuple(rows)
    column_count = len(widths)
    last_cell = f"{_column_name(column_count)}{max(1, len(materialized))}"
    column_xml = "".join(
        (
            f'<col min="{index}" max="{index}" width="{width:g}" '
            'customWidth="1"/>'
        )
        for index, width in enumerate(widths, start=1)
    )
    row_xml: list[str] = []
    for row_number, row in enumerate(materialized, start=1):
        cells = "".join(
            _inline_string_cell(
                f"{_column_name(column_number)}{row_number}",
                value,
                header=row_number == 1,
            )
            for column_number, value in enumerate(row, start=1)
        )
        row_xml.append(f'<row r="{row_number}">{cells}</row>')

    views = (
        '<sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" '
        'state="frozen"/></sheetView></sheetViews>'
        if freeze_header
        else '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
    )
    filter_xml = (
        f'<autoFilter ref="A1:{_column_name(column_count)}{max(1, len(materialized))}"/>'
        if auto_filter
        else ""
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:{last_cell}"/>{views}'
        '<sheetFormatPr defaultRowHeight="15"/>'
        f'<cols>{column_xml}</cols><sheetData>{"".join(row_xml)}</sheetData>'
        f'{filter_xml}</worksheet>'
    )


def _inline_string_cell(reference: str, value: str, *, header: bool) -> str:
    style = ' s="1"' if header else ""
    return (
        f'<c r="{reference}"{style} t="inlineStr"><is>'
        f'<t xml:space="preserve">{escape(value)}</t></is></c>'
    )


def _column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _format_utc(value: datetime) -> str:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("export_timestamp_must_be_timezone_aware")
    return value.astimezone(timezone.utc).isoformat(
        timespec="microseconds"
    ).replace("+00:00", "Z")


def _is_ascii_control(value: str) -> bool:
    codepoint = ord(value)
    return codepoint < 32 or codepoint == 127


def _content_types_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>'
    )


def _root_relationships_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )


def _workbook_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<bookViews><workbookView/></bookViews><sheets>'
        '<sheet name="Members" sheetId="1" r:id="rId1"/>'
        '<sheet name="Manifest" sheetId="2" r:id="rId2"/>'
        '</sheets><calcPr calcId="0" calcMode="manual" fullCalcOnLoad="0" '
        'forceFullCalc="0"/></workbook>'
    )


def _workbook_relationships_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )


def _styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2">'
        '<font><sz val="11"/><name val="Aptos"/><family val="2"/></font>'
        '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/><family val="2"/></font>'
        '</fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF006B5B"/><bgColor indexed="64"/></patternFill></fill>'
        '</fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2">'
        '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>'
        '</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )
