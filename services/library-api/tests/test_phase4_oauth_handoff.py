from scripts.phase4_oauth_handoff_server import (
    DRIVE_SCOPE,
    build_authorization_url,
    build_handoff_evidence,
)


def stage(role: str, fingerprint: str) -> dict[str, object]:
    return {
        "stage_status": "pass",
        "role_label": role,
        "subject_fingerprint_sha256_16": fingerprint,
        "drive_read_pass": True,
        "old_credential_rejected": True,
    }


def test_handoff_passes_for_distinct_admins() -> None:
    result = build_handoff_evidence(
        stage("primary-admin", "1111111111111111"),
        stage("secondary-admin", "2222222222222222"),
    )

    assert result["status"] == "pass"
    assert result["distinct_subjects"] is True
    assert result["drive_permission_mutation_performed"] is False
    assert result["tokens_or_authorization_codes_persisted"] is False


def test_handoff_blocks_same_google_subject() -> None:
    result = build_handoff_evidence(
        stage("primary-admin", "1111111111111111"),
        stage("secondary-admin", "1111111111111111"),
    )

    assert result["status"] == "blocked"


def test_authorization_url_requests_only_required_scopes_and_offline_access() -> None:
    url = build_authorization_url(
        client_id="synthetic.apps.googleusercontent.com",
        expected_hd="st.kitasato-u.ac.jp",
        state="synthetic-state",
    )

    assert "access_type=offline" in url
    assert "prompt=consent+select_account" in url
    assert "hd=st.kitasato-u.ac.jp" in url
    assert "synthetic-state" in url
    assert DRIVE_SCOPE.replace(":", "%3A").replace("/", "%2F") in url


def test_evidence_never_contains_token_fields() -> None:
    result = build_handoff_evidence(
        stage("primary-admin", "1111111111111111"),
        stage("secondary-admin", "2222222222222222"),
    )
    stage_keys = set(result["primary"]) | set(result["secondary"])

    assert "access_token" not in stage_keys
    assert "refresh_token" not in stage_keys
    assert "id_token" not in stage_keys
    assert "authorization_code" not in stage_keys
