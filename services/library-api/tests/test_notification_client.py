from __future__ import annotations

from hashlib import sha256
import hmac
import json
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest

from app.config import (
    NOTIFICATION_HMAC_CONTEXT,
    PRODUCTION_NOTIFICATION_ACTIVATION_CONFIRMATION,
    Settings,
    derive_notification_hmac_key,
)
from app.notification_client import (
    GasNotificationWebhookClient,
    NotificationWebhookError,
    build_signed_envelope,
)


FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "library-registration"
    / "mailapp-notification-v1-test-vector.json"
)
ROOT_KEY = "production-like-attestation-root-key-for-tests-v1"


class FakeResponse:
    def __init__(self, payload: dict[str, Any], status_code: int = 200):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeSession:
    def __init__(self, response: FakeResponse):
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"url": url, **kwargs})
        return self.response


def active_settings() -> Settings:
    return Settings(
        app_env="production",
        external_side_effects_enabled=True,
        phase7_worker_api_enabled=True,
        phase7_drive_api_enabled=True,
        phase7_drive_kill_switch=False,
        phase7_notification_delivery_enabled=True,
        phase7_notification_kill_switch=False,
        phase7_notification_activation_confirmation=(
            PRODUCTION_NOTIFICATION_ACTIVATION_CONFIRMATION
        ),
        drive_operation_attestation_key=ROOT_KEY,
        gas_notification_webhook_url=(
            "https://script.google.com/macros/s/synthetic-deployment/exec"
        ),
    )


def test_backend_signature_matches_shared_gas_fixture() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    request = fixture["request"]
    body, signature = build_signed_envelope(
        UUID(request["messageId"]),
        request["payload"],
        bytes.fromhex(fixture["derivedKeyHex"]),
        issued_at=request["issuedAt"],
    )

    assert signature == request["signature"]
    assert json.loads(body) == request


def test_notification_key_is_domain_separated_from_attestation_root() -> None:
    derived = derive_notification_hmac_key(ROOT_KEY)
    other_context = hmac.new(
        ROOT_KEY.encode("utf-8"),
        b"fsl-mailapp-notification-v2",
        sha256,
    ).digest()

    assert len(derived) == 32
    assert derived == derive_notification_hmac_key(ROOT_KEY)
    assert derived != ROOT_KEY.encode("utf-8")
    assert derived != other_context
    assert NOTIFICATION_HMAC_CONTEXT == b"fsl-mailapp-notification-v1"


def test_gas_client_accepts_duplicate_acknowledgement() -> None:
    settings = active_settings()
    message_id = UUID("8ab3959a-7184-40ca-8208-b4cb481ede35")
    fake_session = FakeSession(
        FakeResponse(
            {"ok": True, "duplicate": True, "messageId": str(message_id)}
        )
    )
    client = GasNotificationWebhookClient(settings)
    client._session = fake_session  # type: ignore[assignment]

    client.send(
        message_id,
        {
            "registrationId": "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141",
            "fullName": "Synthetic Student",
            "email": "student@st.kitasato-u.ac.jp",
            "eligibilityStatus": "approved",
            "driveAccessStatus": "granted",
            "processedAt": "2026-08-04T09:59:30.000Z",
        },
    )

    sent = json.loads(fake_session.calls[0]["data"])
    assert sent["messageId"] == str(message_id)
    assert set(sent) == {
        "version",
        "issuedAt",
        "messageId",
        "payload",
        "signature",
    }
    assert "attestation-root" not in fake_session.calls[0]["data"].decode(
        "utf-8"
    )


def test_gas_retryable_ack_is_classified_without_response_detail() -> None:
    settings = active_settings()
    client = GasNotificationWebhookClient(settings)
    client._session = FakeSession(  # type: ignore[assignment]
        FakeResponse({"ok": False, "code": "busy"})
    )

    with pytest.raises(NotificationWebhookError) as captured:
        client.send(
            UUID("8ab3959a-7184-40ca-8208-b4cb481ede35"),
            {
                "registrationId": "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141",
                "fullName": "Synthetic Student",
                "email": "student@st.kitasato-u.ac.jp",
                "eligibilityStatus": "approved",
                "driveAccessStatus": "granted",
                "processedAt": "2026-08-04T09:59:30.000Z",
            },
        )

    assert captured.value.code == "notification_webhook_retryable_error"
    assert captured.value.retryable is True
    assert "busy" not in str(captured.value)


def test_gas_success_ack_requires_exact_message_id() -> None:
    settings = active_settings()
    client = GasNotificationWebhookClient(settings)
    client._session = FakeSession(  # type: ignore[assignment]
        FakeResponse({"ok": True})
    )

    with pytest.raises(NotificationWebhookError) as captured:
        client.send(
            UUID("8ab3959a-7184-40ca-8208-b4cb481ede35"),
            {
                "registrationId": "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141",
                "fullName": "Synthetic Student",
                "email": "student@st.kitasato-u.ac.jp",
                "eligibilityStatus": "approved",
                "driveAccessStatus": "granted",
                "processedAt": "2026-08-04T09:59:30.000Z",
            },
        )

    assert captured.value.code == "notification_invalid_response"
    assert captured.value.retryable is True


def test_notification_activation_is_exact_and_fail_closed() -> None:
    settings = active_settings()
    settings.validate_phase7_notification_boundary()

    with pytest.raises(ValueError, match="confirmation"):
        settings.model_copy(
            update={"phase7_notification_activation_confirmation": "wrong"}
        ).validate_phase7_notification_boundary()
    with pytest.raises(ValueError, match="kill switch"):
        settings.model_copy(
            update={"phase7_notification_kill_switch": True}
        ).validate_phase7_notification_boundary()
    with pytest.raises(ValueError, match="webhook"):
        settings.model_copy(
            update={"gas_notification_webhook_url": "https://example.test/x"}
        ).validate_phase7_notification_boundary()
