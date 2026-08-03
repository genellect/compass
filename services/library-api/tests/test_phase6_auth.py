import pytest

from app.auth import (
    GoogleCredentialError,
    GoogleTokenVerifier,
)
from app.config import Settings


SETTINGS = Settings(
    phase6_auth_api_enabled=True,
    google_oauth_client_ids="phase6-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
)


def valid_claims(**overrides):
    claims = {
        "aud": "phase6-client-id",
        "iss": "https://accounts.google.com",
        "sub": "synthetic-google-subject",
        "email": "Student@st.kitasato-u.ac.jp",
        "email_verified": True,
        "hd": "st.kitasato-u.ac.jp",
    }
    claims.update(overrides)
    return claims


def test_verifier_returns_server_derived_identity() -> None:
    observed_audiences: list[str | None] = []

    def loader(_credential: str, audience: str | None):
        observed_audiences.append(audience)
        return valid_claims()

    identity = GoogleTokenVerifier(
        SETTINGS,
        claims_loader=loader,
    ).verify("synthetic.signed.credential")

    assert observed_audiences == ["phase6-client-id"]
    assert identity.email == "student@st.kitasato-u.ac.jp"
    assert identity.hosted_domain == "st.kitasato-u.ac.jp"
    assert identity.google_sub == "synthetic-google-subject"
    assert len(identity.subject_hash) == 64
    assert "synthetic-google-subject" not in identity.subject_hash


@pytest.mark.parametrize(
    ("overrides", "expected_code", "expected_status"),
    [
        ({"aud": "other-client"}, "invalid_google_credential", 401),
        ({"iss": "https://example.invalid"}, "invalid_google_credential", 401),
        ({"sub": ""}, "invalid_google_credential", 401),
        ({"email_verified": False}, "unverified_google_email", 403),
        ({"hd": None}, "workspace_membership_required", 403),
        (
            {"hd": "gmail.com"},
            "workspace_membership_required",
            403,
        ),
    ],
)
def test_verifier_fails_closed_for_invalid_claims(
    overrides,
    expected_code: str,
    expected_status: int,
) -> None:
    verifier = GoogleTokenVerifier(
        SETTINGS,
        claims_loader=lambda _credential, _audience: valid_claims(
            **overrides
        ),
    )

    with pytest.raises(GoogleCredentialError) as captured:
        verifier.verify("synthetic.signed.credential")

    assert captured.value.code == expected_code
    assert captured.value.status_code == expected_status


def test_multiple_client_ids_are_checked_after_signature_verification() -> None:
    settings = Settings(
        google_oauth_client_ids="web-client,local-client",
        allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    )
    observed: list[str | None] = []

    def loader(_credential: str, audience: str | None):
        observed.append(audience)
        return valid_claims(aud="local-client")

    identity = GoogleTokenVerifier(
        settings,
        claims_loader=loader,
    ).verify("synthetic.signed.credential")

    assert observed == [None]
    assert identity.audience == "local-client"


def test_signature_expiry_or_claim_verification_failure_is_generic() -> None:
    def rejecting_loader(_credential: str, _audience: str | None):
        raise ValueError("synthetic expired or invalid signature")

    verifier = GoogleTokenVerifier(
        SETTINGS,
        claims_loader=rejecting_loader,
    )

    with pytest.raises(GoogleCredentialError) as captured:
        verifier.verify("synthetic.signed.credential")

    assert captured.value.code == "invalid_google_credential"
    assert captured.value.status_code == 401
    assert "expired" not in str(captured.value)


def test_verifier_rejects_missing_configuration() -> None:
    verifier = GoogleTokenVerifier(
        Settings(
            google_oauth_client_ids="",
            allowed_google_hosted_domains="",
        ),
        claims_loader=lambda _credential, _audience: valid_claims(),
    )

    with pytest.raises(RuntimeError, match="OAuth client ID"):
        verifier.verify("synthetic.signed.credential")
