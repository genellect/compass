from __future__ import annotations

import base64
from dataclasses import dataclass
from uuid import uuid4

import google.auth
from google.auth.transport.requests import AuthorizedSession

from app.config import Settings


CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


class RegistrationEventDispatchError(RuntimeError):
    """A best-effort registration wake-up could not be queued."""


@dataclass(frozen=True)
class RegistrationEventDispatchResult:
    enqueued: bool
    task_id: str | None = None


def _authorized_session() -> AuthorizedSession:
    credentials, _project_id = google.auth.default(
        scopes=[CLOUD_PLATFORM_SCOPE]
    )
    return AuthorizedSession(credentials)


def enqueue_registration_worker_wakeup(
    settings: Settings,
    *,
    session_factory=_authorized_session,
) -> RegistrationEventDispatchResult:
    """Wake the private worker without placing registration data in the task.

    The database remains the durable source of work. Cloud Tasks is only the
    low-latency wake-up path; the existing Scheduler continues to reconcile
    pending operations if task creation or delivery fails.
    """

    if not settings.registration_event_dispatch_enabled:
        return RegistrationEventDispatchResult(enqueued=False)

    task_id = f"registration-{uuid4().hex}"
    queue_path = (
        f"projects/{settings.cloud_tasks_project_id}/locations/"
        f"{settings.cloud_tasks_location}/queues/"
        f"{settings.cloud_tasks_queue_id}"
    )
    endpoint = f"https://cloudtasks.googleapis.com/v2/{queue_path}/tasks"
    body = base64.b64encode(b'{"limit":20}').decode("ascii")
    payload = {
        "task": {
            "name": f"{queue_path}/tasks/{task_id}",
            "httpRequest": {
                "httpMethod": "POST",
                "url": settings.cloud_tasks_worker_url,
                "headers": {"Content-Type": "application/json"},
                "body": body,
                "oidcToken": {
                    "serviceAccountEmail": (
                        settings.cloud_tasks_oidc_service_account
                    ),
                    "audience": settings.cloud_tasks_oidc_audience,
                },
            },
        }
    }

    try:
        with session_factory() as transport:
            response = transport.post(
                endpoint,
                json=payload,
                timeout=settings.cloud_tasks_request_timeout_seconds,
            )
    except Exception as error:
        raise RegistrationEventDispatchError(
            "registration_event_dispatch_failed"
        ) from error

    if not 200 <= response.status_code < 300:
        raise RegistrationEventDispatchError(
            "registration_event_dispatch_failed"
        )
    return RegistrationEventDispatchResult(enqueued=True, task_id=task_id)
