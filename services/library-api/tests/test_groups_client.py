import pytest
from app.config import Settings
from app.groups_client import GoogleGroupsClient, GROUPS_SCOPE
from app.drive_client import DriveClientError


def client():
    return GoogleGroupsClient(Settings(
        google_groups_allowed_ids="groups/testA",
        google_groups_oauth_client_id="synthetic-client",
        google_groups_oauth_client_secret="synthetic-secret",
        google_groups_oauth_refresh_token="synthetic-refresh",
    ))


def payload(email="synthetic@example.test", roles=None):
    return {"name": "groups/testA/memberships/member1",
            "preferredMemberKey": {"id": email},
            "roles": roles or [{"name": "MEMBER"}]}


def test_separate_oauth_scope_and_no_drive_scope():
    c = client()
    assert c.credentials.scopes == [GROUPS_SCOPE]


def test_no_out_of_allowlist_requests(monkeypatch):
    c = client()
    monkeypatch.setattr(c, "_request", lambda *a, **k: pytest.fail("unexpected request"))
    with pytest.raises(DriveClientError, match="allowlisted"):
        c.find_member("groups/other", "synthetic@example.test")


def test_create_only_member_and_wait_for_operation(monkeypatch):
    c = client()
    calls = []
    def request(method, path, **kwargs):
        calls.append((method, path, kwargs))
        return {"done": False, "name": "operations/pending"}
    monkeypatch.setattr(c, "_request", request)
    with pytest.raises(DriveClientError, match="pending"):
        c.add_member("groups/testA", "synthetic@example.test")
    assert calls[0][2]["body"]["roles"] == [{"name": "MEMBER"}]
    assert len(calls) == 1


@pytest.mark.parametrize("response", [
    payload(email="someone-else@example.test"),
    payload(roles=[{"name": "MEMBER"}, {"name": "OWNER"}]),
    payload(roles=[{"name": "MEMBER", "expiryDetail": {"expireTime": "2027-01-01T00:00:00Z"}}]),
    {**payload(), "name": "groups/other/memberships/member1"},
])
def test_mismatched_expiring_or_privileged_membership_refused(response):
    with pytest.raises(DriveClientError, match="mismatch"):
        client()._membership(response, "groups/testA", "synthetic@example.test")


def test_lookup_get_and_remove_confirm_identity(monkeypatch):
    c = client()
    calls = []
    responses = [{"name": "groups/testA/memberships/member1"}, payload(), {"done": True}, None]
    def request(method, path, **kwargs):
        calls.append((method, path, kwargs))
        return responses.pop(0)
    monkeypatch.setattr(c, "_request", request)
    c.remove_member("groups/testA", "groups/testA/memberships/member1", "synthetic@example.test")
    assert [method for method, _, _ in calls] == ["GET", "GET", "DELETE", "GET"]
    assert all("/permissions" not in path for _, path, _ in calls)


@pytest.mark.parametrize(("status", "retryable"), [(403, False), (401, False), (429, True), (503, True)])
def test_http_status_is_privacy_safe_and_bounded(monkeypatch, status, retryable):
    from unittest.mock import Mock
    c = client()
    c.credentials.token = "synthetic-token"
    response = Mock(status_code=status, text="private-body-never-log")
    monkeypatch.setattr(c.session, "request", lambda *a, **k: response)
    with pytest.raises(DriveClientError) as exc:
        c._request("GET", "groups/testA")
    assert exc.value.retryable == retryable
    assert "private-body" not in str(exc.value)


def test_catalogue_count_handles_pages_without_exposing_members(monkeypatch):
    c = client()
    pages = [
        {"memberships": [{}, {}], "nextPageToken": "next"},
        {"memberships": [{}]},
    ]
    monkeypatch.setattr(c, "_request", lambda *a, **k: pages.pop(0))
    assert c.count_members("groups/testA") == 3


def test_repeated_page_token_is_bounded(monkeypatch):
    c = client()
    monkeypatch.setattr(c, "_request", lambda *a, **k: {"nextPageToken": "loop"})
    with pytest.raises(DriveClientError, match="pagination"):
        c.count_members("groups/testA")


@pytest.mark.parametrize("response", [None, {"roles": [{"name": []}]}, {"roles": [None]}])
def test_malformed_membership_returns_safe_error(response):
    with pytest.raises(DriveClientError):
        client()._membership(response, "groups/testA", "synthetic@example.test")


def test_invalid_group_labels_returns_safe_error(monkeypatch):
    c = client()
    monkeypatch.setattr(c, "_request", lambda *a, **k: {
        "name": "groups/testA", "groupKey": {"id": "group@example.test"}, "labels": None,
    })
    with pytest.raises(DriveClientError, match="identity_mismatch"):
        c.verify_group("groups/testA", "group@example.test")


def test_token_refresh_uses_same_bounded_transport(monkeypatch):
    from unittest.mock import Mock
    c = client()
    calls = []
    transport = Mock(side_effect=lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr("app.groups_client.Request", lambda **kwargs: transport)
    c.credentials = Mock(valid=False, token="synthetic-token")
    c.credentials.refresh.side_effect = lambda request: request(
        url="https://oauth2.googleapis.com/token", method="POST", timeout=120,
    )
    response = Mock(status_code=200)
    response.json.return_value = {}
    monkeypatch.setattr(c.session, "request", lambda *a, **k: response)
    assert c._request("GET", "groups/testA") == {}
    assert calls[0]["timeout"] == c.timeout
    assert calls[0]["allow_redirects"] is False
