from __future__ import annotations

from datetime import UTC, datetime
import json
from types import SimpleNamespace

import pytest
from sqlalchemy.exc import SQLAlchemyError

from scripts import phase9_legacy_migration as phase9_cli
from scripts.phase9_legacy_migration import (
    MANIFEST_FILENAME,
    Phase9CliError,
    _status_payload,
    drive_resource_fingerprint,
    load_bundle,
    prepare_manifest,
    write_row_reconciliation_report,
)


GOOGLE_FORM = (
    "氏名,学年,学籍番号,自動収集メール,入力大学メール,所属学部,利用規約,個人情報\r\n"
    "合成 花子,1年,PP23000,hanako@st.kitasato-u.ac.jp,hanako@st.kitasato-u.ac.jp,薬学部,理解しました,理解しました\r\n"
)
MANAGEMENT = (
    "処理日時,氏名,学年,学籍番号,自動収集メール,入力メール,招待対象メール,判定結果,判定理由,共有ドライブ処理,申請者メール,管理者メール,エラー詳細,申請種別,連絡先メール,問い合わせ内容,利用規約回答,個人情報回答,所属学部\r\n"
    "2026-08-01T00:00:00Z,合成 花子,1年,PP23000,hanako@st.kitasato-u.ac.jp,hanako@st.kitasato-u.ac.jp,hanako@st.kitasato-u.ac.jp,承認,,,,,,,,,理解しました,理解しました,薬学部\r\n"
)
MEMBER_ROSTER = (
    "氏名,学籍番号,学年,登録日時\r\n"
    "合成 花子,PP23000,1年,\r\n"
)
DRIVE = (
    "id,emailAddress,role,type\r\n"
    "permission-synthetic,hanako@st.kitasato-u.ac.jp,reader,user\r\n"
)
FINGERPRINT_KEY = b"phase9-cli-synthetic-fingerprint-key-0001"
RESOURCE_ID = "phase9-cli-synthetic-drive-resource"


def _prepare(tmp_path, **overrides):
    options = {
        "reference_at": datetime(2026, 8, 1, tzinfo=UTC),
        "fingerprint_key_version": "synthetic-key-v1",
        "drive_resource_id": RESOURCE_ID,
        "fingerprint_key": FINGERPRINT_KEY,
    }
    options.update(overrides)
    return prepare_manifest(tmp_path, **options)


def _write_bundle(tmp_path) -> None:
    (tmp_path / "google-form.csv").write_text(GOOGLE_FORM, encoding="utf-8")
    (tmp_path / "management-sheet.csv").write_text(
        MANAGEMENT,
        encoding="utf-8",
    )
    (tmp_path / "member-roster.csv").write_text(
        MEMBER_ROSTER,
        encoding="utf-8",
    )
    (tmp_path / "drive-permissions.csv").write_text(DRIVE, encoding="utf-8")


def test_prepare_and_load_bundle_pins_exact_bytes_headers_and_rows(tmp_path) -> None:
    _write_bundle(tmp_path)
    manifest_path = _prepare(tmp_path)
    manifest, sources = load_bundle(tmp_path)

    assert manifest_path.name == MANIFEST_FILENAME
    assert manifest["reference_at_utc"] == "2026-08-01T00:00:00+00:00"
    assert set(sources) == {
        "google_form",
        "management_sheet",
        "member_roster",
        "drive_permission",
    }
    assert sources["google_form"].rows[0].source_row_number == 2
    assert sources["google_form"].rows[0].source_payload["学籍番号"] == "PP23000"
    assert "合成 花子" not in manifest_path.read_text(encoding="utf-8")
    assert manifest["target_drive_resource_fingerprint"] == (
        drive_resource_fingerprint(FINGERPRINT_KEY, RESOURCE_ID)
    )
    assert manifest["raw_snapshot_retention_days"] == 90
    assert RESOURCE_ID not in manifest_path.read_text(encoding="utf-8")


def test_load_bundle_fails_closed_when_source_changes_after_manifest(tmp_path) -> None:
    _write_bundle(tmp_path)
    _prepare(tmp_path)
    (tmp_path / "google-form.csv").write_text(
        GOOGLE_FORM.replace("PP23000", "PP23001"),
        encoding="utf-8",
    )

    with pytest.raises(Phase9CliError, match="snapshot hash changed"):
        load_bundle(tmp_path)


def test_load_bundle_rejects_manifest_path_traversal(tmp_path) -> None:
    _write_bundle(tmp_path)
    manifest_path = _prepare(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sources"]["google_form"]["filename"] = "../outside.csv"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(Phase9CliError, match="plain filename"):
        load_bundle(tmp_path)


def test_prepare_manifest_refuses_implicit_overwrite(tmp_path) -> None:
    _write_bundle(tmp_path)
    kwargs = {
        "reference_at": datetime(2026, 8, 1, tzinfo=UTC),
        "fingerprint_key_version": "synthetic-key-v1",
        "drive_resource_id": RESOURCE_ID,
        "fingerprint_key": FINGERPRINT_KEY,
    }
    prepare_manifest(tmp_path, **kwargs)
    with pytest.raises(Phase9CliError, match="refuse implicit overwrite"):
        prepare_manifest(tmp_path, **kwargs)


@pytest.mark.parametrize(
    "content",
    [
        (
            "氏名,学年,学籍番号,自動収集メール,所属学部,利用規約,個人情報\r\n"
            "合成 花子,1年,PP23000,hanako@st.kitasato-u.ac.jp,薬学部,理解しました,理解しました\r\n"
        ),
        GOOGLE_FORM.replace("氏名,学年", "氏名,氏名"),
        GOOGLE_FORM.replace("入力大学メール", "大学メールアドレス"),
    ],
)
def test_prepare_manifest_rejects_missing_duplicate_or_wrong_headers(
    tmp_path,
    content: str,
) -> None:
    _write_bundle(tmp_path)
    (tmp_path / "google-form.csv").write_text(content, encoding="utf-8")
    with pytest.raises(Phase9CliError, match="snapshot"):
        _prepare(tmp_path)


def test_load_bundle_rejects_target_or_retention_manifest_tampering(
    tmp_path,
) -> None:
    _write_bundle(tmp_path)
    manifest_path = _prepare(tmp_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["target_drive_resource_fingerprint"] = "not-a-fingerprint"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(Phase9CliError, match="fingerprint"):
        load_bundle(tmp_path)

    manifest["target_drive_resource_fingerprint"] = drive_resource_fingerprint(
        FINGERPRINT_KEY,
        RESOURCE_ID,
    )
    manifest["raw_snapshot_retention_days"] = 0
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(Phase9CliError, match="retention"):
        load_bundle(tmp_path)


def test_status_exposes_only_stable_safe_lineage_hashes() -> None:
    row = SimpleNamespace(
        apply_status="pending",
        member_created_by_batch=False,
        access_grant_created_by_batch=False,
    )
    batch = SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        status="validated",
        record_version=1,
        schema_version="legacy-v1",
        normalization_rule_version="phase9-v1",
        fingerprint_key_version="synthetic-v1",
        reference_at=datetime(2026, 8, 1, tzinfo=UTC),
        source_hash="a" * 64,
        dry_run_hash="b" * 64,
        target_drive_resource_fingerprint="c" * 64,
        staged_normalized_hash="d" * 64,
        approved_normalized_hash=None,
        row_count=1,
        rows=[row],
        dry_run_report_json={"raw_snapshot_retention_days": 90},
        approved_at=None,
        applied_at=None,
        rolled_back_at=None,
        raw_snapshot_expires_at=datetime(2026, 10, 30, tzinfo=UTC),
        raw_purged_at=None,
        legal_hold=False,
    )
    payload = _status_payload(batch)
    assert payload["target_drive_resource_fingerprint"] == "c" * 64
    assert payload["staged_normalized_hash"] == "d" * 64
    assert payload["raw_snapshot_retention_days"] == 90
    assert "source_payload" not in json.dumps(payload)


def test_row_reconciliation_artifact_is_non_pii_and_refuses_overwrite(
    tmp_path,
) -> None:
    row = SimpleNamespace(
        source_system="google_form",
        source_row_number=2,
        source_row_fingerprint="e" * 64,
        classification="ready",
        error_codes=[],
        apply_status="pending",
    )
    batch = SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        source_hash="a" * 64,
        target_drive_resource_fingerprint="b" * 64,
        staged_normalized_hash="c" * 64,
        approved_normalized_hash=None,
        row_count=1,
        rows=[row],
    )
    output = write_row_reconciliation_report(batch, tmp_path)
    serialized = output.read_text(encoding="utf-8")
    assert "hanako@st.kitasato-u.ac.jp" not in serialized
    assert "PP23000" not in serialized
    assert "permission-synthetic" not in serialized
    assert json.loads(serialized)["contains_direct_pii"] is False
    with pytest.raises(Phase9CliError, match="refuse overwrite"):
        write_row_reconciliation_report(batch, tmp_path)


def test_main_hides_sqlalchemy_error_details(monkeypatch, capsys) -> None:
    marker = "private-person@st.kitasato-u.ac.jp"

    def fail(_arguments):
        raise SQLAlchemyError(marker)

    monkeypatch.setattr(phase9_cli, "_run_database_command", fail)
    monkeypatch.setattr(
        "sys.argv",
        [
            "phase9_legacy_migration.py",
            "status",
            "11111111-1111-1111-1111-111111111111",
        ],
    )
    assert phase9_cli.main() == 2
    output = capsys.readouterr().out
    assert "database_operation_failed" in output
    assert marker not in output
