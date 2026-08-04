from http.server import HTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from urllib.parse import parse_qs, urlparse

import pytest
import requests

from scripts import phase7_production_drive_bootstrap_server as helper


APPROVED_FOLDER_ID = "approved-production-folder-id"
APPROVED_FINGERPRINT = helper._fingerprint(APPROVED_FOLDER_ID)


class FakeSecretSink:
    def __init__(
        self,
        *,
        fail_preflight: bool = False,
        fail_on_add: int | None = None,
    ) -> None:
        self.fail_preflight = fail_preflight
        self.fail_on_add = fail_on_add
        self.preflight_calls: list[tuple[str, ...]] = []
        self.add_calls: list[tuple[str, str]] = []

    def assert_existing(self, secret_ids) -> None:
        self.preflight_calls.append(tuple(secret_ids))
        if self.fail_preflight:
            raise helper.SecretSinkError("fake preflight failure")

    def add_version(self, secret_id: str, value: str) -> int:
        if self.fail_on_add == len(self.add_calls) + 1:
            raise helper.SecretSinkError("fake version write failure")
        self.add_calls.append((secret_id, value))
        return 40 + len(self.add_calls)


def _folder_metadata(folder_id: str = APPROVED_FOLDER_ID) -> dict[str, object]:
    return {
        "id": folder_id,
        "mimeType": helper.FOLDER_MIME_TYPE,
        "trashed": False,
        "ownedByMe": True,
        "capabilities": {"canShare": True},
    }


def test_authorization_is_loopback_offline_drive_file_only() -> None:
    query = parse_qs(urlparse(helper._authorization_url("client", "state")).query)

    assert query["redirect_uri"] == ["http://localhost:8769/oauth2/callback"]
    assert query["access_type"] == ["offline"]
    assert query["prompt"] == ["consent select_account"]
    assert query["include_granted_scopes"] == ["false"]
    assert query["scope"] == [
        "openid email https://www.googleapis.com/auth/drive.file"
    ]


def test_production_folder_requires_owner_folder_shareable_and_fingerprint(
    monkeypatch,
) -> None:
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: _folder_metadata())

    observed = helper._verify_selected_production_folder(
        "ephemeral-access",
        APPROVED_FOLDER_ID,
        APPROVED_FINGERPRINT,
    )

    assert observed == APPROVED_FINGERPRINT[:16]


@pytest.mark.parametrize(
    ("override", "expected"),
    (
        ({"mimeType": "text/plain"}, "owned, shareable"),
        ({"trashed": True}, "owned, shareable"),
        ({"ownedByMe": False}, "owned, shareable"),
        ({"capabilities": {"canShare": False}}, "owned, shareable"),
    ),
)
def test_production_folder_rejects_failed_metadata_gate(
    monkeypatch,
    override: dict[str, object],
    expected: str,
) -> None:
    metadata = _folder_metadata()
    metadata.update(override)
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: metadata)

    with pytest.raises(RuntimeError, match=expected):
        helper._verify_selected_production_folder(
            "ephemeral-access",
            APPROVED_FOLDER_ID,
            APPROVED_FINGERPRINT,
        )


def test_production_folder_rejects_nonapproved_fingerprint(monkeypatch) -> None:
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: _folder_metadata())

    with pytest.raises(RuntimeError, match="human-approved"):
        helper._verify_selected_production_folder(
            "ephemeral-access",
            APPROVED_FOLDER_ID,
            "0" * 64,
        )


def test_secret_stream_uses_fake_sink_and_result_is_sanitized() -> None:
    sink = FakeSecretSink()
    raw_values = {
        "client_id": "raw-client-id",
        "client_secret": "raw-client-secret",
        "refresh_token": "raw-refresh-token",
        "folder_id": APPROVED_FOLDER_ID,
    }

    records = helper.stream_secret_versions(sink, raw_values)
    result = helper.build_sanitized_result(
        status="pass",
        owner_subject_fingerprint="a" * 16,
        folder_fingerprint=APPROVED_FINGERPRINT[:16],
        records=records,
    )
    serialized = json.dumps(result)

    assert len(sink.add_calls) == 4
    assert [call[0] for call in sink.add_calls] == [
        secret_id for secret_id, _ in helper.SECRET_VALUE_BINDINGS
    ]
    assert [record.version for record in records] == [41, 42, 43, 44]
    assert all(value not in serialized for value in raw_values.values())
    assert result["drive_permissions_mutated"] is False
    assert result["raw_credentials_or_drive_ids_persisted"] is False


def test_missing_secret_container_prevents_every_version_write() -> None:
    sink = FakeSecretSink(fail_preflight=True)

    with pytest.raises(helper.PartialSecretWriteError) as captured:
        helper.stream_secret_versions(
            sink,
            {
                "client_id": "client",
                "client_secret": "secret",
                "refresh_token": "refresh",
                "folder_id": APPROVED_FOLDER_ID,
            },
        )

    assert captured.value.records == ()
    assert sink.add_calls == []


@pytest.mark.parametrize(
    ("status", "expected"),
    (("pass", 0), ("blocked", 4), ("incomplete", 4)),
)
def test_bootstrap_exit_code_requires_complete_pass(
    status: str,
    expected: int,
) -> None:
    assert helper.BootstrapOutcome(status=status).exit_code == expected


@pytest.mark.parametrize(
    ("status", "expected"),
    (("pass", 0), ("blocked", 4), ("incomplete", 4)),
)
def test_main_returns_nonzero_unless_bootstrap_passes(
    monkeypatch,
    status: str,
    expected: int,
) -> None:
    outcome = helper.BootstrapOutcome(status=status)
    sink = FakeSecretSink()

    class FakeServer:
        def __init__(self, _address, handler) -> None:
            self.RequestHandlerClass = handler

        def serve_forever(self) -> None:
            return

        def server_close(self) -> None:
            return

    required = {
        "PHASE7_PRODUCTION_GCP_PROJECT_ID": "safe-project",
        "PHASE7_PRODUCTION_OAUTH_CLIENT_ID": "safe-client-id",
        "PHASE7_PRODUCTION_OAUTH_CLIENT_SECRET": "safe-client-secret",
        "PHASE7_PRODUCTION_PICKER_API_KEY": "safe-picker-key",
        "PHASE7_PRODUCTION_PICKER_APP_ID": "123456789",
        "PHASE7_PRODUCTION_APPROVED_FOLDER_SHA256": APPROVED_FINGERPRINT,
        "PHASE7_PRODUCTION_GCLOUD_EXECUTABLE": "fake-gcloud",
    }
    for name, value in required.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(helper, "BootstrapOutcome", lambda: outcome)
    monkeypatch.setattr(helper, "GcloudSecretManagerSink", lambda *_args, **_kwargs: sink)
    monkeypatch.setattr(helper, "HTTPServer", FakeServer)

    assert helper.main() == expected


def test_sanitized_result_rejects_nonfingerprint_identity() -> None:
    with pytest.raises(ValueError, match="Sanitized"):
        helper.build_sanitized_result(
            status="pass",
            owner_subject_fingerprint="raw-owner-subject",
            folder_fingerprint=APPROVED_FINGERPRINT[:16],
            records=(),
        )


def test_gcloud_sink_streams_payload_over_stdin_only() -> None:
    calls: list[tuple[list[str], dict[str, object]]] = []

    def fake_runner(argv, **kwargs):
        calls.append((list(argv), dict(kwargs)))
        secret_id = argv[4]
        return subprocess.CompletedProcess(
            argv,
            0,
            stdout=f"projects/safe-project/secrets/{secret_id}/versions/7\n",
            stderr="",
        )

    sink = helper.GcloudSecretManagerSink(
        "safe-project",
        executable="fake-gcloud",
        runner=fake_runner,
    )
    raw_secret = "must-never-appear-in-argv"

    version = sink.add_version("fsl-drive-oauth-client-secret", raw_secret)

    argv, kwargs = calls[0]
    assert version == 7
    assert "--data-file=-" in argv
    assert raw_secret not in " ".join(argv)
    assert kwargs["input"] == raw_secret
    assert kwargs["capture_output"] is True
    assert kwargs["text"] is True


def test_gcloud_error_never_exposes_captured_payload_or_stderr() -> None:
    def fake_runner(argv, **_kwargs):
        return subprocess.CompletedProcess(
            argv,
            1,
            stdout="",
            stderr="raw-secret-should-not-escape",
        )

    sink = helper.GcloudSecretManagerSink(
        "safe-project",
        executable="fake-gcloud",
        runner=fake_runner,
    )

    with pytest.raises(helper.SecretSinkError) as captured:
        sink.add_version("fsl-drive-oauth-client-secret", "raw-secret")

    assert "raw-secret" not in str(captured.value)
    assert "stderr" not in str(captured.value)


def test_http_flow_requires_exact_phrase_and_uses_only_fake_sink(
    monkeypatch,
    capsys,
) -> None:
    sink = FakeSecretSink()
    outcome = helper.BootstrapOutcome()
    monkeypatch.setattr(
        helper,
        "_exchange_code",
        lambda *_args, **_kwargs: {
            "access_token": "raw-access-token",
            "refresh_token": "raw-refresh-token",
            "id_token": "raw-id-token",
        },
    )
    monkeypatch.setattr(helper, "_verify_id_token", lambda *_args: "b" * 16)
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: _folder_metadata())
    handler = helper.create_handler(
        client_id="raw-client-id",
        client_secret="raw-client-secret",
        picker_api_key="raw-picker-key",
        picker_app_id="123456789",
        approved_folder_fingerprint=APPROVED_FINGERPRINT,
        secret_sink=sink,
        outcome=outcome,
    )
    server = HTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    headers = {"Host": "localhost:8769"}
    post_headers = {
        **headers,
        "Origin": "http://localhost:8769",
    }
    try:
        authorize = requests.get(
            base_url + "/authorize",
            headers=headers,
            allow_redirects=False,
            timeout=5,
        )
        state = parse_qs(urlparse(authorize.headers["Location"]).query)["state"][0]
        callback = requests.get(
            base_url + f"/oauth2/callback?code=fake-code&state={state}",
            headers=headers,
            allow_redirects=False,
            timeout=5,
        )
        assert callback.status_code == 303

        selected = requests.post(
            base_url + "/select",
            headers=post_headers,
            data={"folder": APPROVED_FOLDER_ID},
            timeout=5,
        )
        assert selected.status_code == 200
        assert APPROVED_FOLDER_ID not in selected.text

        wrong = requests.post(
            base_url + "/commit",
            headers=post_headers,
            data={"confirmation": "I_APPROVED_SOMETHING_ELSE"},
            timeout=5,
        )
        assert wrong.status_code == 400
        assert sink.add_calls == []

        accepted = requests.post(
            base_url + "/commit",
            headers=post_headers,
            data={"confirmation": helper.EXACT_CONFIRMATION},
            timeout=5,
        )
        assert accepted.status_code == 200
        assert len(sink.add_calls) == 4
        assert outcome.status == "pass"
        assert outcome.exit_code == 0
        for raw_value in (
            "raw-client-id",
            "raw-client-secret",
            "raw-refresh-token",
            APPROVED_FOLDER_ID,
        ):
            assert raw_value not in accepted.text
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.RequestHandlerClass.shutdown_cleanup()
        server.server_close()

    output = capsys.readouterr().out
    assert "raw-client-id" not in output
    assert "raw-client-secret" not in output
    assert "raw-refresh-token" not in output
    assert APPROVED_FOLDER_ID not in output


def test_http_partial_secret_write_is_blocked_and_nonzero(
    monkeypatch,
    capsys,
) -> None:
    sink = FakeSecretSink(fail_on_add=3)
    outcome = helper.BootstrapOutcome()
    monkeypatch.setattr(
        helper,
        "_exchange_code",
        lambda *_args, **_kwargs: {
            "access_token": "raw-access-token",
            "refresh_token": "raw-refresh-token",
            "id_token": "raw-id-token",
        },
    )
    monkeypatch.setattr(helper, "_verify_id_token", lambda *_args: "b" * 16)
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: _folder_metadata())
    handler = helper.create_handler(
        client_id="raw-client-id",
        client_secret="raw-client-secret",
        picker_api_key="raw-picker-key",
        picker_app_id="123456789",
        approved_folder_fingerprint=APPROVED_FINGERPRINT,
        secret_sink=sink,
        outcome=outcome,
    )
    server = HTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    headers = {"Host": "localhost:8769"}
    post_headers = {**headers, "Origin": "http://localhost:8769"}
    try:
        authorize = requests.get(
            base_url + "/authorize",
            headers=headers,
            allow_redirects=False,
            timeout=5,
        )
        state = parse_qs(urlparse(authorize.headers["Location"]).query)["state"][0]
        callback = requests.get(
            base_url + f"/oauth2/callback?code=fake-code&state={state}",
            headers=headers,
            allow_redirects=False,
            timeout=5,
        )
        assert callback.status_code == 303
        selected = requests.post(
            base_url + "/select",
            headers=post_headers,
            data={"folder": APPROVED_FOLDER_ID},
            timeout=5,
        )
        assert selected.status_code == 200
        accepted = requests.post(
            base_url + "/commit",
            headers=post_headers,
            data={"confirmation": helper.EXACT_CONFIRMATION},
            timeout=5,
        )
        assert accepted.status_code == 200
        assert "BLOCKED" in accepted.text
        assert len(sink.add_calls) == 2
        assert outcome.status == "blocked"
        assert outcome.exit_code == 4
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.RequestHandlerClass.shutdown_cleanup()
        server.server_close()

    output = capsys.readouterr().out
    for raw_value in (
        "raw-client-id",
        "raw-client-secret",
        "raw-refresh-token",
        APPROVED_FOLDER_ID,
    ):
        assert raw_value not in output


def test_helper_source_has_no_drive_permission_mutation_endpoint() -> None:
    source = Path(helper.__file__).read_text(encoding="utf-8")

    assert "permissions.create" not in source
    assert "permissions.delete" not in source
    assert '"POST", f"files/' not in source
    assert '"DELETE", f"files/' not in source


def test_module_entrypoint_resolves_application_package() -> None:
    environment = os.environ.copy()
    for name in tuple(environment):
        if name.startswith("PHASE7_PRODUCTION_"):
            environment.pop(name)

    completed = subprocess.run(
        [sys.executable, "-m", "scripts.phase7_production_drive_bootstrap_server"],
        cwd=Path(helper.__file__).resolve().parents[1],
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert completed.returncode == 2
    assert "Missing required process values" in completed.stdout
    assert "ModuleNotFoundError" not in completed.stderr


def test_powershell_launcher_uses_module_entrypoint() -> None:
    launcher = (
        Path(helper.__file__).resolve().parents[3]
        / "scripts"
        / "start-phase7b-production-drive-bootstrap.ps1"
    ).read_text(encoding="utf-8-sig")

    assert "& $python -m scripts.phase7_production_drive_bootstrap_server" in launcher
    assert "& $python $serverScript" not in launcher
