from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import quote

from google.auth import exceptions as google_auth_exceptions
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
import requests

from app.config import Settings
from app.eligibility import normalize_email


DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
RETRYABLE_HTTP_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}


@dataclass(frozen=True)
class DrivePermission:
    permission_id: str
    role: str


class DriveClientError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class DrivePermissionClient(Protocol):
    def find_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission | None: ...

    def create_reader_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission: ...

    def delete_permission(
        self,
        resource_id: str,
        permission_id: str,
    ) -> None: ...


class GoogleDrivePermissionClient:
    def __init__(self, settings: Settings) -> None:
        settings.validate_phase7_google_drive_configuration()
        self._settings = settings
        self._session = requests.Session()
        self._credentials = Credentials(
            token=None,
            refresh_token=settings.google_drive_oauth_refresh_token,
            token_uri=settings.google_drive_oauth_token_url,
            client_id=settings.google_drive_oauth_client_id,
            client_secret=settings.google_drive_oauth_client_secret,
            scopes=[DRIVE_FILE_SCOPE],
        )

    def _access_token(self) -> str:
        if not self._credentials.valid:
            try:
                self._credentials.refresh(GoogleAuthRequest(session=self._session))
            except google_auth_exceptions.TransportError as error:
                raise DriveClientError(
                    "drive_auth_transport_error",
                    retryable=True,
                ) from error
            except google_auth_exceptions.GoogleAuthError as error:
                raise DriveClientError(
                    "drive_authentication_failed",
                    retryable=False,
                ) from error
        token = self._credentials.token
        if not token:
            raise DriveClientError(
                "drive_authentication_failed",
                retryable=False,
            )
        return token

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str | int | bool] | None = None,
        json_body: dict[str, str] | None = None,
        allow_not_found: bool = False,
    ) -> dict[str, Any]:
        url = f"{self._settings.google_drive_api_base_url.rstrip('/')}/{path}"
        try:
            response = self._session.request(
                method,
                url,
                params=params,
                json=json_body,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {self._access_token()}",
                },
                timeout=self._settings.drive_request_timeout_seconds,
            )
        except (requests.Timeout, requests.ConnectionError) as error:
            raise DriveClientError(
                "drive_api_unavailable",
                retryable=True,
            ) from error
        except requests.RequestException as error:
            raise DriveClientError(
                "drive_request_failed",
                retryable=False,
            ) from error

        if allow_not_found and response.status_code == 404:
            return {}
        if not 200 <= response.status_code < 300:
            raise self._http_error(response.status_code)
        if response.status_code == 204 or not response.content:
            return {}
        try:
            payload = response.json()
        except ValueError as error:
            raise DriveClientError(
                "drive_invalid_response",
                retryable=True,
            ) from error
        if not isinstance(payload, dict):
            raise DriveClientError(
                "drive_invalid_response",
                retryable=True,
            )
        return payload

    @staticmethod
    def _http_error(status_code: int) -> DriveClientError:
        if status_code in RETRYABLE_HTTP_STATUSES:
            return DriveClientError("drive_api_retryable_error", retryable=True)
        if status_code == 401:
            return DriveClientError(
                "drive_authentication_failed",
                retryable=False,
            )
        if status_code == 403:
            return DriveClientError("drive_permission_denied", retryable=False)
        if status_code == 404:
            return DriveClientError("drive_resource_not_found", retryable=False)
        return DriveClientError("drive_request_rejected", retryable=False)

    def find_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission | None:
        normalized_email = normalize_email(email)
        page_token = ""
        observed_tokens: set[str] = set()
        encoded_resource = quote(resource_id, safe="")

        for _ in range(20):
            params: dict[str, str | int | bool] = {
                "pageSize": 100,
                "supportsAllDrives": "true",
                "fields": (
                    "nextPageToken,"
                    "permissions(id,type,role,emailAddress,deleted)"
                ),
            }
            if page_token:
                params["pageToken"] = page_token
            payload = self._request(
                "GET",
                f"files/{encoded_resource}/permissions",
                params=params,
            )
            permissions = payload.get("permissions", [])
            if not isinstance(permissions, list):
                raise DriveClientError(
                    "drive_invalid_response",
                    retryable=True,
                )
            for permission in permissions:
                if not isinstance(permission, dict):
                    continue
                if permission.get("deleted") is True:
                    continue
                permission_email = normalize_email(
                    str(permission.get("emailAddress") or "")
                )
                permission_id = str(permission.get("id") or "")
                role = str(permission.get("role") or "")
                if (
                    permission_email == normalized_email
                    and permission_id
                    and role
                ):
                    return DrivePermission(permission_id, role)

            next_page = str(payload.get("nextPageToken") or "")
            if not next_page:
                return None
            if next_page in observed_tokens:
                raise DriveClientError(
                    "drive_invalid_pagination",
                    retryable=True,
                )
            observed_tokens.add(next_page)
            page_token = next_page

        raise DriveClientError("drive_pagination_limit", retryable=True)

    def create_reader_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission:
        encoded_resource = quote(resource_id, safe="")
        payload = self._request(
            "POST",
            f"files/{encoded_resource}/permissions",
            params={
                "sendNotificationEmail": "true",
                "supportsAllDrives": "true",
                "fields": "id,role,emailAddress",
            },
            json_body={
                "type": "user",
                "role": "reader",
                "emailAddress": normalize_email(email),
            },
        )
        permission_id = str(payload.get("id") or "")
        role = str(payload.get("role") or "")
        if not permission_id or role != "reader":
            raise DriveClientError(
                "drive_invalid_response",
                retryable=True,
            )
        return DrivePermission(permission_id, role)

    def delete_permission(
        self,
        resource_id: str,
        permission_id: str,
    ) -> None:
        encoded_resource = quote(resource_id, safe="")
        encoded_permission = quote(permission_id, safe="")
        self._request(
            "DELETE",
            f"files/{encoded_resource}/permissions/{encoded_permission}",
            params={"supportsAllDrives": "true"},
            allow_not_found=True,
        )
