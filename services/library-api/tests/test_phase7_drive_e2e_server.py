from datetime import UTC, datetime, timedelta
from http.client import HTTPConnection
from http.server import HTTPServer
import threading

import pytest
import requests

from scripts import phase7_drive_e2e_server as helper
from scripts.phase7_drive_e2e_server import build_sanitized_evidence


def _evidence(**overrides: bool) -> dict[str, object]:
    confirmations = {
        "notification_received_confirmed": True,
        "recipient_view_confirmed": True,
        "recipient_edit_denied_confirmed": True,
        "recipient_revocation_confirmed": True,
        "permission_created": True,
        "replay_created_zero_permissions": True,
        "managed_permission_deleted": True,
        "permission_absent_after_delete": True,
        "oauth_revocation_endpoint_accepted": True,
        "oauth_refresh_invalid_grant_confirmed": True,
    }
    confirmations.update(overrides)
    return build_sanitized_evidence(
        owner_subject_fingerprint="owner-fingerprint",
        owner_email_domain="example.com",
        recipient_email="recipient@example.net",
        folder_id="secret-folder-id",
        permission_id="secret-permission-id",
        **confirmations,
    )


def test_phase7_drive_e2e_evidence_contains_only_fingerprints() -> None:
    evidence = _evidence()
    serialized = str(evidence)

    assert evidence["status"] == "pass"
    assert evidence["scope"] == "https://www.googleapis.com/auth/drive.file"
    assert "recipient@example.net" not in serialized
    assert "secret-folder-id" not in serialized
    assert "secret-permission-id" not in serialized
    assert "access_token" not in serialized
    assert "refresh_token" not in serialized
    assert evidence["oauth_revocation_endpoint_accepted"] is True
    assert evidence["oauth_refresh_invalid_grant_confirmed"] is True


def test_phase7_drive_e2e_requires_recipient_confirmation_and_revoke() -> None:
    evidence = _evidence(
        recipient_view_confirmed=False,
    )

    assert evidence["status"] == "blocked"


@pytest.mark.parametrize(
    "failed_gate",
    (
        "notification_received_confirmed",
        "recipient_edit_denied_confirmed",
        "recipient_revocation_confirmed",
        "oauth_revocation_endpoint_accepted",
        "oauth_refresh_invalid_grant_confirmed",
    ),
)
def test_phase7_drive_e2e_evidence_requires_each_manual_and_oauth_gate(
    failed_gate: str,
) -> None:
    assert _evidence(**{failed_gate: False})["status"] == "blocked"


def test_phase7_drive_e2e_accepts_only_loopback_host_header() -> None:
    assert helper._valid_local_host("localhost:8767")
    assert helper._valid_local_host("127.0.0.1:8767")
    assert not helper._valid_local_host("attacker.example")
    assert not helper._valid_local_host("localhost:8767.attacker.example")


def test_phase7_drive_e2e_stage_transition_is_single_use() -> None:
    flow = {"stage": "grant_confirmation"}

    assert helper._transition(flow, "grant_confirmation", "recipient_confirmation")
    assert not helper._transition(
        flow,
        "grant_confirmation",
        "recipient_confirmation",
    )
    assert flow["stage"] == "recipient_confirmation"


def test_phase7_drive_e2e_requires_owned_fresh_empty_folder(monkeypatch) -> None:
    created_time = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    responses = iter(
        (
            {
                "id": "fresh-folder-id",
                "mimeType": helper.FOLDER_MIME_TYPE,
                "trashed": False,
                "ownedByMe": True,
                "createdTime": created_time,
                "capabilities": {"canShare": True},
            },
            {"files": []},
        )
    )
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: next(responses))

    helper._verify_selected_empty_folder("access", "fresh-folder-id")


def test_phase7_drive_e2e_rejects_old_folder(monkeypatch) -> None:
    old_time = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    monkeypatch.setattr(
        helper,
        "_drive_get",
        lambda *_args, **_kwargs: {
            "id": "older-folder-id",
            "mimeType": helper.FOLDER_MIME_TYPE,
            "trashed": False,
            "ownedByMe": True,
            "createdTime": old_time,
            "capabilities": {"canShare": True},
        },
    )

    with pytest.raises(RuntimeError, match="within 24 hours"):
        helper._verify_selected_empty_folder("access", "older-folder-id")


def test_phase7_drive_e2e_rejects_nonempty_folder(monkeypatch) -> None:
    responses = iter(
        (
            {
                "id": "filled-folder-id",
                "mimeType": helper.FOLDER_MIME_TYPE,
                "trashed": False,
                "ownedByMe": True,
                "createdTime": datetime.now(UTC).isoformat(),
                "capabilities": {"canShare": True},
            },
            {"files": [{"id": "child-file-id"}]},
        )
    )
    monkeypatch.setattr(helper, "_drive_get", lambda *_args, **_kwargs: next(responses))

    with pytest.raises(RuntimeError, match="not empty"):
        helper._verify_selected_empty_folder("access", "filled-folder-id")


def test_phase7_drive_e2e_http_boundary_and_single_use_stage(tmp_path) -> None:
    handler = helper.create_handler(
        client_id="test-client",
        client_secret="test-secret",
        picker_api_key="test-picker-key",
        picker_app_id="123456789",
        recipient_email="recipient@example.net",
        output_directory=str(tmp_path),
    )
    server = HTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    allowed_host = {"Host": "localhost:8767"}
    try:
        page = requests.get(base_url, headers=allowed_host, timeout=5)
        assert page.status_code == 200
        assert page.headers["Content-Security-Policy"] == helper.CONTENT_SECURITY_POLICY
        assert page.headers["X-Frame-Options"] == "DENY"

        rejected_host = requests.get(
            base_url,
            headers={"Host": "attacker.example"},
            timeout=5,
        )
        assert rejected_host.status_code == 421
        assert "Content-Security-Policy" in rejected_host.headers

        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
        connection.putrequest("POST", "/select", skip_host=True)
        connection.putheader("Host", "localhost:8767")
        connection.putheader("Content-Type", "application/x-www-form-urlencoded")
        connection.putheader("Content-Length", helper.MAX_REQUEST_BYTES + 1)
        connection.endheaders()
        oversized = connection.getresponse()
        assert oversized.status == 413
        oversized.read()
        connection.close()

        first_authorize = requests.get(
            base_url + "/authorize",
            headers=allowed_host,
            allow_redirects=False,
            timeout=5,
        )
        second_authorize = requests.get(
            base_url + "/authorize",
            headers=allowed_host,
            allow_redirects=False,
            timeout=5,
        )
        assert first_authorize.status_code == 303
        assert second_authorize.status_code == 409
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.RequestHandlerClass.shutdown_cleanup()
        server.server_close()
