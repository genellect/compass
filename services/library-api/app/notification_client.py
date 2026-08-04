from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import hmac
import json
from typing import Any, Protocol
from uuid import UUID

import requests

from app.config import Settings, derive_notification_hmac_key


RETRYABLE_HTTP_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}
SUCCESS_ACK_STATUSES = {"accepted", "duplicate", "ok", "sent"}
RETRYABLE_GATEWAY_CODES = {"busy", "email", "internal", "quota", "stale"}
NOTIFICATION_VERSION = "fsl-notification-v1"


class NotificationWebhookError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class NotificationWebhookClient(Protocol):
    def send(self, message_id: UUID, payload: dict[str, Any]) -> None: ...


def build_signed_envelope(
    message_id: UUID,
    payload: dict[str, Any],
    key: bytes,
    *,
    issued_at: str | None = None,
) -> tuple[bytes, str]:
    canonical_payload = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    current_issued_at = issued_at or datetime.now(UTC).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")
    stable_message_id = str(message_id).lower()
    signature_input = "\n".join(
        (
            NOTIFICATION_VERSION,
            current_issued_at,
            stable_message_id,
            canonical_payload,
        )
    )
    signature = hmac.new(
        key,
        signature_input.encode("utf-8"),
        sha256,
    ).hexdigest()
    envelope = {
        "version": NOTIFICATION_VERSION,
        "issuedAt": current_issued_at,
        "messageId": stable_message_id,
        "payload": payload,
        "signature": signature,
    }
    encoded = json.dumps(
        envelope,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return encoded, signature


class GasNotificationWebhookClient:
    def __init__(self, settings: Settings) -> None:
        settings.validate_phase7_notification_configuration()
        self._settings = settings
        self._session = requests.Session()

    def send(self, message_id: UUID, payload: dict[str, Any]) -> None:
        body, signature = build_signed_envelope(
            message_id,
            payload,
            derive_notification_hmac_key(
                self._settings.drive_operation_attestation_key
            ),
        )
        try:
            response = self._session.post(
                self._settings.gas_notification_webhook_url,
                data=body,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json; charset=utf-8",
                    "X-FSL-Signature": f"sha256={signature}",
                    "X-FSL-Signature-Version": "v1",
                },
                timeout=self._settings.notification_request_timeout_seconds,
            )
        except (requests.Timeout, requests.ConnectionError) as error:
            raise NotificationWebhookError(
                "notification_webhook_unavailable",
                retryable=True,
            ) from error
        except requests.RequestException as error:
            raise NotificationWebhookError(
                "notification_request_failed",
                retryable=False,
            ) from error

        if not 200 <= response.status_code < 300:
            raise NotificationWebhookError(
                "notification_webhook_retryable_error"
                if response.status_code in RETRYABLE_HTTP_STATUSES
                else "notification_webhook_rejected",
                retryable=response.status_code in RETRYABLE_HTTP_STATUSES,
            )
        try:
            acknowledgement = response.json()
        except ValueError as error:
            raise NotificationWebhookError(
                "notification_invalid_response",
                retryable=True,
            ) from error
        if not isinstance(acknowledgement, dict):
            raise NotificationWebhookError(
                "notification_invalid_response",
                retryable=True,
            )

        expected_message_id = str(message_id).lower()
        returned_message_id = str(acknowledgement.get("messageId") or "")
        acknowledged = acknowledgement.get("ok") is True or str(
            acknowledgement.get("status") or ""
        ).lower() in SUCCESS_ACK_STATUSES
        if acknowledgement.get("ok") is False:
            gateway_code = str(acknowledgement.get("code") or "")
            retryable = gateway_code in RETRYABLE_GATEWAY_CODES
            raise NotificationWebhookError(
                "notification_webhook_retryable_error"
                if retryable
                else "notification_webhook_rejected",
                retryable=retryable,
            )
        if not acknowledged or returned_message_id != expected_message_id:
            raise NotificationWebhookError(
                "notification_invalid_response",
                retryable=True,
            )
