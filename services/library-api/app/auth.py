from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Literal

import cachecontrol
from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
import requests

from app.config import Settings, get_settings
from app.eligibility import normalize_email
from app.schemas import AccountFacts


GOOGLE_ISSUERS = {
    "accounts.google.com",
    "https://accounts.google.com",
}


class GoogleAuthConfigurationError(RuntimeError):
    pass


class GoogleCredentialError(RuntimeError):
    def __init__(self, code: str, *, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class VerifiedGoogleIdentity:
    google_sub: str
    email: str
    email_verified: bool
    hosted_domain: str
    issuer: str
    audience: str

    @property
    def subject_hash(self) -> str:
        return sha256(self.google_sub.encode("utf-8")).hexdigest()

    def to_account_facts(self, settings: Settings) -> AccountFacts:
        return AccountFacts(
            verified=True,
            token_valid=True,
            email_verified=self.email_verified,
            email=self.email,
            hosted_domain=self.hosted_domain,
            allowed_hosted_domains=list(
                settings.allowed_google_hosted_domain_list
            ),
        )


ClaimsLoader = Callable[[str, str | None], Mapping[str, Any]]


def _build_google_request() -> google_requests.Request:
    # Google's signing certificates rotate. CacheControl respects the
    # response cache headers so normal verification does not fetch them for
    # every registration request.
    session = cachecontrol.CacheControl(requests.Session())
    return google_requests.Request(session=session)


_GOOGLE_REQUEST = _build_google_request()


def _load_google_claims(
    credential: str,
    audience: str | None,
) -> Mapping[str, Any]:
    return google_id_token.verify_oauth2_token(
        credential,
        _GOOGLE_REQUEST,
        audience=audience,
    )


class GoogleTokenVerifier:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        claims_loader: ClaimsLoader | None = None,
        audience_kind: Literal["registration", "admin"] = "registration",
    ) -> None:
        self.settings = settings or get_settings()
        self.claims_loader = claims_loader or _load_google_claims
        self.audience_kind = audience_kind

    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        try:
            if self.audience_kind == "admin":
                self.settings.validate_admin_oauth_configuration()
                client_ids = self.settings.google_admin_oauth_client_id_list
            else:
                self.settings.validate_phase6_configuration()
                client_ids = self.settings.google_oauth_client_id_list
        except ValueError as error:
            raise GoogleAuthConfigurationError(str(error)) from error

        if not credential or len(credential) > self.settings.google_id_token_max_chars:
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            )

        verification_audience = client_ids[0] if len(client_ids) == 1 else None
        try:
            claims = self.claims_loader(
                credential,
                verification_audience,
            )
        except (
            ValueError,
            google_auth_exceptions.GoogleAuthError,
            requests.RequestException,
        ) as error:
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            ) from error

        audience = claims.get("aud")
        issuer = claims.get("iss")
        google_sub = claims.get("sub")
        email = claims.get("email")
        email_verified = claims.get("email_verified")
        hosted_domain = claims.get("hd")

        if not isinstance(audience, str) or audience not in client_ids:
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            )
        if not isinstance(issuer, str) or issuer not in GOOGLE_ISSUERS:
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            )
        if (
            not isinstance(google_sub, str)
            or not google_sub
            or len(google_sub) > 255
        ):
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            )
        if email_verified is not True:
            raise GoogleCredentialError(
                "unverified_google_email",
                status_code=403,
            )
        if not isinstance(email, str):
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            )
        normalized_email = normalize_email(email)
        if not normalized_email or len(normalized_email) > 320:
            raise GoogleCredentialError(
                "invalid_google_credential",
                status_code=401,
            )
        if self.audience_kind == "admin":
            if (
                normalized_email
                not in self.settings.google_admin_allowed_email_list
            ):
                raise GoogleCredentialError(
                    "admin_email_not_allowed",
                    status_code=403,
                )
            if hosted_domain is None:
                # Consumer Google accounts do not carry an hd claim. The
                # exact email allowlist is the admin-entry gate; the stable
                # Google sub remains the database authorization identity.
                normalized_hosted_domain = ""
            elif isinstance(hosted_domain, str):
                normalized_hosted_domain = hosted_domain.strip().lower()
            else:
                raise GoogleCredentialError(
                    "invalid_google_credential",
                    status_code=401,
                )
        else:
            if not isinstance(hosted_domain, str):
                raise GoogleCredentialError(
                    "workspace_membership_required",
                    status_code=403,
                )
            normalized_hosted_domain = hosted_domain.strip().lower()
            if (
                normalized_hosted_domain
                not in self.settings.allowed_google_hosted_domain_list
            ):
                raise GoogleCredentialError(
                    "workspace_membership_required",
                    status_code=403,
                )

        return VerifiedGoogleIdentity(
            google_sub=google_sub,
            email=normalized_email,
            email_verified=True,
            hosted_domain=normalized_hosted_domain,
            issuer=issuer,
            audience=audience,
        )
