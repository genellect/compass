from datetime import UTC, datetime, timedelta

from scripts.phase4_oidc_evidence_server import build_evidence


CLIENT_ID = "phase4-client.apps.googleusercontent.com"
NOW = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)


def valid_claims() -> dict[str, object]:
    return {
        "aud": CLIENT_ID,
        "iss": "https://accounts.google.com",
        "exp": int((NOW + timedelta(minutes=30)).timestamp()),
        "email_verified": "true",
        "email": "synthetic@st.kitasato-u.ac.jp",
        "hd": "kitasato-u.ac.jp",
        "sub": "synthetic-google-sub",
    }


def test_build_evidence_passes_and_redacts_identifiers() -> None:
    evidence = build_evidence(
        valid_claims(),
        expected_client_id=CLIENT_ID,
        expected_hd="kitasato-u.ac.jp",
        role_label="workspace-member",
        now=NOW,
    )

    assert evidence["status"] == "pass"
    assert evidence["hosted_domain"] == "kitasato-u.ac.jp"
    assert evidence["email_domain"] == "st.kitasato-u.ac.jp"
    assert len(str(evidence["subject_fingerprint_sha256_16"])) == 16
    assert "email" not in evidence
    assert "sub" not in evidence
    assert "aud" not in evidence


def test_build_evidence_blocks_missing_hosted_domain() -> None:
    claims = valid_claims()
    claims.pop("hd")

    evidence = build_evidence(
        claims,
        expected_client_id=CLIENT_ID,
        expected_hd="",
        role_label="workspace-member",
        now=NOW,
    )

    assert evidence["status"] == "blocked"
    assert evidence["hosted_domain_present"] is False


def test_build_evidence_blocks_wrong_audience() -> None:
    claims = valid_claims()
    claims["aud"] = "wrong-client.apps.googleusercontent.com"

    evidence = build_evidence(
        claims,
        expected_client_id=CLIENT_ID,
        expected_hd="kitasato-u.ac.jp",
        role_label="workspace-member",
        now=NOW,
    )

    assert evidence["status"] == "blocked"
    assert evidence["audience_match"] is False


def test_build_evidence_blocks_expected_hd_mismatch() -> None:
    evidence = build_evidence(
        valid_claims(),
        expected_client_id=CLIENT_ID,
        expected_hd="example.ac.jp",
        role_label="workspace-member",
        now=NOW,
    )

    assert evidence["status"] == "blocked"
    assert evidence["expected_hd_match"] is False
