from __future__ import annotations

from typing import Any

import pytest

from app.config import Settings
from app.drive_client import (
    DRIVE_PERMISSION_EMAIL_MESSAGE,
    DriveClientError,
    GoogleDrivePermissionClient,
)


SETTINGS = Settings(
    drive_resource_id="synthetic-drive-resource",
    google_drive_oauth_client_id="synthetic-client-id",
    google_drive_oauth_client_secret="synthetic-client-secret",
    google_drive_oauth_refresh_token="synthetic-refresh-token",
)


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any] | None = None):
        self.status_code = status_code
        self._payload = payload
        self.content = b"{}" if payload is not None else b""

    def json(self) -> dict[str, Any]:
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = responses
        self.requests: list[dict[str, Any]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.requests.append({"method": method, "url": url, **kwargs})
        return self.responses.pop(0)


def client_with_responses(monkeypatch, responses: list[FakeResponse]):
    client = GoogleDrivePermissionClient(SETTINGS)
    fake_session = FakeSession(responses)
    client._session = fake_session  # type: ignore[assignment]
    monkeypatch.setattr(client, "_access_token", lambda: "synthetic-access")
    return client, fake_session


def test_permission_list_follows_pages_and_preserves_existing_role(
    monkeypatch,
) -> None:
    client, session = client_with_responses(
        monkeypatch,
        [
            FakeResponse(
                200,
                {
                    "permissions": [],
                    "nextPageToken": "next-page",
                },
            ),
            FakeResponse(
                200,
                {
                    "permissions": [
                        {
                            "id": "existing-permission",
                            "type": "user",
                            "role": "writer",
                            "emailAddress": "Student@st.kitasato-u.ac.jp",
                        }
                    ]
                },
            ),
        ],
    )

    permission = client.find_permission(
        "folder/with special",
        "student@st.kitasato-u.ac.jp",
    )

    assert permission is not None
    assert permission.permission_id == "existing-permission"
    assert permission.role == "writer"
    assert len(session.requests) == 2
    assert session.requests[1]["params"]["pageToken"] == "next-page"
    assert "folder%2Fwith%20special" in session.requests[0]["url"]


def test_permission_create_forces_reader_and_standard_notification(
    monkeypatch,
) -> None:
    client, session = client_with_responses(
        monkeypatch,
        [FakeResponse(200, {"id": "new-permission", "role": "reader"})],
    )

    permission = client.create_reader_permission(
        "folder-id",
        "Student@st.kitasato-u.ac.jp",
    )

    request = session.requests[0]
    assert permission.permission_id == "new-permission"
    assert request["method"] == "POST"
    assert request["params"]["sendNotificationEmail"] == "true"
    assert request["params"]["emailMessage"] == (
        "未来戦略ライブラリの利用登録が完了しました。"
        "この通知内のリンクから共有フォルダをご利用ください。"
    )
    assert request["params"]["emailMessage"] == DRIVE_PERMISSION_EMAIL_MESSAGE
    assert request["json"] == {
        "type": "user",
        "role": "reader",
        "emailAddress": "student@st.kitasato-u.ac.jp",
    }


def test_permission_delete_treats_already_missing_as_success(monkeypatch) -> None:
    client, session = client_with_responses(
        monkeypatch,
        [FakeResponse(404)],
    )

    client.delete_permission("folder-id", "permission-id")

    assert session.requests[0]["method"] == "DELETE"
    assert session.requests[0]["params"]["supportsAllDrives"] == "true"


def test_drive_errors_are_generic_and_retry_classified(monkeypatch) -> None:
    client, _session = client_with_responses(
        monkeypatch,
        [
            FakeResponse(
                503,
                {"error": {"message": "student@st.kitasato-u.ac.jp"}},
            )
        ],
    )

    with pytest.raises(DriveClientError) as captured:
        client.find_permission(
            "folder-id",
            "student@st.kitasato-u.ac.jp",
        )

    assert captured.value.code == "drive_api_retryable_error"
    assert captured.value.retryable is True
    assert "student@" not in str(captured.value)


@pytest.mark.parametrize(
    ("reason", "expected_code", "retryable"),
    [
        ("appNotAuthorizedToFile", "drive_app_not_authorized", False),
        ("accessNotConfigured", "drive_api_not_configured", False),
        (
            "insufficientFilePermissions",
            "drive_insufficient_file_permissions",
            False,
        ),
        ("domainPolicy", "drive_sharing_policy_denied", False),
        ("cannotShareAcrossDomains", "drive_sharing_policy_denied", False),
        ("sharingRateLimitExceeded", "drive_sharing_rate_limited", True),
        ("userRateLimitExceeded", "drive_sharing_rate_limited", True),
        ("newUnknownPermissionReason", "drive_permission_denied", True),
    ],
)
def test_drive_403_reason_is_safely_classified_without_message(
    monkeypatch,
    reason: str,
    expected_code: str,
    retryable: bool,
) -> None:
    client, _session = client_with_responses(
        monkeypatch,
        [
            FakeResponse(
                403,
                {
                    "error": {
                        "message": "student@st.kitasato-u.ac.jp cannot share",
                        "errors": [{"reason": reason}],
                    }
                },
            )
        ],
    )

    with pytest.raises(DriveClientError) as captured:
        client.create_reader_permission(
            "folder-id",
            "student@st.kitasato-u.ac.jp",
        )

    assert captured.value.code == expected_code
    assert captured.value.retryable is retryable
    assert "student@" not in str(captured.value)
