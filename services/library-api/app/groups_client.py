"""Cloud Identity membership API. No group/Drive creation or role elevation."""
from dataclasses import dataclass
import re
from typing import Protocol

from google.auth import exceptions as auth_errors
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
import requests

from app.drive_client import DriveClientError

GROUPS_SCOPE = "https://www.googleapis.com/auth/cloud-identity.groups"
BASE_URL = "https://cloudidentity.googleapis.com/v1/"
GROUP_NAME = re.compile(r"groups/[a-zA-Z0-9_-]+")


@dataclass(frozen=True)
class GroupMembership:
    name: str
    email: str
    roles: frozenset[str]


class GroupsClient(Protocol):
    def verify_group(self, name: str, email: str) -> None: ...
    def find_member(self, group: str, email: str) -> GroupMembership | None: ...
    def add_member(self, group: str, email: str) -> GroupMembership: ...
    def remove_member(self, group: str, name: str, email: str) -> None: ...


class GoogleGroupsClient:
    def __init__(self, settings):
        values = (settings.google_groups_oauth_client_id,
                  settings.google_groups_oauth_client_secret,
                  settings.google_groups_oauth_refresh_token)
        self.allowed = frozenset(settings._csv_values(settings.google_groups_allowed_ids))
        if not all(values) or not self.allowed or any(
            not GROUP_NAME.fullmatch(name) for name in self.allowed
        ):
            raise DriveClientError("groups_not_configured", retryable=False)
        self.timeout = settings.groups_request_timeout_seconds
        self.session = requests.Session()
        self.credentials = Credentials(
            token=None, client_id=values[0], client_secret=values[1],
            refresh_token=values[2], token_uri="https://oauth2.googleapis.com/token",
            scopes=[GROUPS_SCOPE],
        )

    def _check_group(self, group):
        if group not in self.allowed or not GROUP_NAME.fullmatch(group):
            raise DriveClientError("group_not_allowlisted", retryable=False)

    def _request(self, method, path, *, params=None, body=None, missing_ok=False):
        try:
            if not self.credentials.valid:
                transport = Request(session=self.session)
                def bounded_refresh(**kwargs):
                    # google-auth otherwise uses a much longer default timeout.
                    kwargs["timeout"] = self.timeout
                    kwargs["allow_redirects"] = False
                    return transport(**kwargs)
                self.credentials.refresh(bounded_refresh)
            response = self.session.request(
                method, BASE_URL + path,
                headers={"Authorization": f"Bearer {self.credentials.token}"},
                params=params, json=body, timeout=self.timeout, allow_redirects=False,
            )
        except auth_errors.TransportError as error:
            raise DriveClientError("groups_transport_error", retryable=True) from error
        except auth_errors.GoogleAuthError as error:
            raise DriveClientError("groups_authentication_failed", retryable=False) from error
        except requests.RequestException as error:
            raise DriveClientError("groups_transport_error", retryable=True) from error
        if response.status_code == 404 and missing_ok:
            return None
        if response.status_code not in range(200, 300):
            raise DriveClientError(
                "groups_request_failed",
                retryable=response.status_code in {408, 409, 425, 429, 500, 502, 503, 504},
            )
        try:
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError()
            return result
        except ValueError as error:
            raise DriveClientError("groups_invalid_response", retryable=True) from error

    def verify_group(self, name, email):
        self._check_group(name)
        result = self._request("GET", name)
        key = result.get("groupKey")
        labels = result.get("labels")
        if (not isinstance(key, dict) or not isinstance(key.get("id"), str)
            or not isinstance(labels, dict)
            or result.get("name") != name or key["id"].lower() != email
            or "cloudidentity.googleapis.com/groups.discussion_forum" not in labels
            or "cloudidentity.googleapis.com/groups.dynamic" in labels):
            raise DriveClientError("group_identity_mismatch", retryable=False)

    @staticmethod
    def _membership(result, group, email):
        if not isinstance(result, dict) or not isinstance(result.get("roles"), list):
            raise DriveClientError("groups_invalid_response", retryable=True)
        name = result.get("name", "")
        key = result.get("preferredMemberKey")
        if any(not isinstance(role, dict) or not isinstance(role.get("name"), str)
               for role in result["roles"]):
            raise DriveClientError("groups_invalid_response", retryable=True)
        roles = frozenset(role["name"] for role in result["roles"])
        if (not isinstance(name, str) or not re.fullmatch(re.escape(group) + r"/memberships/[a-zA-Z0-9_-]+", name)
            or not isinstance(key, dict) or not isinstance(key.get("id"), str)
            or key["id"].lower() != email
            or roles != {"MEMBER"}
            or any(not isinstance(role, dict) or "expiryDetail" in role for role in result["roles"])):
            raise DriveClientError("group_membership_mismatch", retryable=False)
        return GroupMembership(name, email, roles)

    def find_member(self, group, email):
        self._check_group(group)
        result = self._request("GET", group + "/memberships:lookup",
                               params={"memberKey.id": email}, missing_ok=True)
        if result is None:
            return None
        name = result.get("name", "")
        if not isinstance(name, str) or not re.fullmatch(re.escape(group) + r"/memberships/[a-zA-Z0-9_-]+", name):
            raise DriveClientError("groups_invalid_response", retryable=False)
        member = self._request("GET", name, missing_ok=True)
        return None if member is None else self._membership(member, group, email)

    def count_members(self, group):
        """Provisioning-only inventory; do not return or log the membership list."""
        self._check_group(group)
        count, page, seen = 0, "", set()
        for _ in range(20):
            result = self._request("GET", group + "/memberships",
                params={"pageSize": 1000, "pageToken": page, "view": "BASIC"})
            members = result.get("memberships", [])
            if not isinstance(members, list):
                raise DriveClientError("groups_invalid_response", retryable=True)
            count += len(members)
            page = result.get("nextPageToken", "")
            if not page:
                return count
            if not isinstance(page, str) or page in seen:
                raise DriveClientError("groups_invalid_pagination", retryable=True)
            seen.add(page)
        raise DriveClientError("groups_pagination_limit", retryable=False)

    def add_member(self, group, email):
        self._check_group(group)
        operation = self._request("POST", group + "/memberships", body={
            "preferredMemberKey": {"id": email}, "roles": [{"name": "MEMBER"}],
        })
        # An asynchronous/ambiguous result is retried through lookup, never
        # treated as a grant. Do not spin-poll or log Google's response/PII.
        if operation.get("done") is not True or "error" in operation:
            raise DriveClientError("group_membership_pending", retryable=True)
        return self._membership(operation.get("response", {}), group, email)

    def remove_member(self, group, name, email):
        self._check_group(group)
        existing = self.find_member(group, email)
        if existing is None:
            return
        if existing.name != name:
            raise DriveClientError("group_membership_mismatch", retryable=False)
        operation = self._request("DELETE", name, missing_ok=True)
        if operation is not None and (operation.get("done") is not True or "error" in operation):
            raise DriveClientError("group_membership_pending", retryable=True)
        if self.find_member(group, email) is not None:
            raise DriveClientError("group_membership_pending", retryable=True)
