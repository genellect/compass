from __future__ import annotations

import base64
from typing import Any

import pytest

from app.config import Settings
from app.registration_event_dispatch import (
    RegistrationEventDispatchError,
    enqueue_registration_worker_wakeup,
)


class FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class FakeTransport:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code
        self.requests: list[dict[str, Any]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.requests.append({"url": url, **kwargs})
        return FakeResponse(self.status_code)


def enabled_settings() -> Settings:
    return Settings(
        registration_event_dispatch_enabled=True,
        registration_event_dispatch_activation_confirmation=(
            "I_APPROVED_PRODUCTION_REGISTRATION_EVENT_DISPATCH_V1"
        ),
        cloud_tasks_project_id="compass-auth-502802",
        cloud_tasks_location="asia-southeast1",
        cloud_tasks_queue_id="fsl-registration-events",
        cloud_tasks_worker_url=(
            "https://fsl-registration-worker-example.asia-southeast1.run.app/"
            "phase7/internal/operations/process"
        ),
        cloud_tasks_oidc_service_account=(
            "fsl-registration-task-invoker@compass-auth-502802.iam."
            "gserviceaccount.com"
        ),
        cloud_tasks_oidc_audience="https://fsl-registration-worker.internal",
    )


def test_disabled_dispatch_does_not_create_transport() -> None:
    result = enqueue_registration_worker_wakeup(
        Settings(),
        session_factory=lambda: (_ for _ in ()).throw(
            AssertionError("transport must not be created")
        ),
    )

    assert result.enqueued is False
    assert result.task_id is None


def test_dispatch_payload_is_pii_free_and_targets_private_worker() -> None:
    transport = FakeTransport()
    result = enqueue_registration_worker_wakeup(
        enabled_settings(),
        session_factory=lambda: transport,
    )

    assert result.enqueued is True
    assert result.task_id is not None
    request = transport.requests[0]
    task = request["json"]["task"]
    http_request = task["httpRequest"]
    assert request["url"].endswith(
        "/projects/compass-auth-502802/locations/asia-southeast1/"
        "queues/fsl-registration-events/tasks"
    )
    assert http_request["url"].endswith(
        "/phase7/internal/operations/process"
    )
    assert base64.b64decode(http_request["body"]) == b'{"limit":20}'
    serialized = str(request["json"])
    assert "student@" not in serialized
    assert "application_id" not in serialized
    assert "student_number" not in serialized
    assert http_request["oidcToken"]["audience"] == (
        "https://fsl-registration-worker.internal"
    )


def test_dispatch_failure_is_generic() -> None:
    transport = FakeTransport(status_code=403)

    with pytest.raises(RegistrationEventDispatchError) as captured:
        enqueue_registration_worker_wakeup(
            enabled_settings(),
            session_factory=lambda: transport,
        )

    assert str(captured.value) == "registration_event_dispatch_failed"
