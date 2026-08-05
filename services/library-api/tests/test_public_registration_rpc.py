from __future__ import annotations

import json
from uuid import UUID, uuid4

import pytest

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.public_registration_rpc import (
    PublicRegistrationRpcBoundaryError,
    fetch_public_registration_status_v1,
)
from app.registration_service import persist_registration
from app.schemas import EligibilityStatus
from tests.factories import student_registration


RPC_TOKEN = "independent-public-registration-rpc-token-000001"
SETTINGS = Settings(
    app_env="production",
    service_surface="public",
    database_url=(
        "postgresql+psycopg://api:secret@ep-test-pooler.example/"
        "neondb?sslmode=require"
    ),
    database_url_unpooled=None,
    runtime_database_role="fsl_api_login",
    public_database_access_mode="rpc_v1",
    public_registration_rpc_key_version="v1",
    public_registration_rpc_token=RPC_TOKEN,
    phase5_local_api_enabled=False,
    phase6_auth_api_enabled=True,
    google_oauth_client_ids="phase6-client-id",
    allowed_google_hosted_domains="st.kitasato-u.ac.jp",
    cors_allowed_origins="https://compass-official.pages.dev",
    rate_limits_enabled=True,
    api_read_only_mode=True,
    terms_version="terms-1.0",
    privacy_version="privacy-1.0",
    terms_content_sha256="a" * 64,
    privacy_content_sha256="b" * 64,
    drive_operation_attestation_key=(
        "independent-drive-operation-attestation-key-000001"
    ),
)
IDENTITY = VerifiedGoogleIdentity(
    google_sub="rpc-subject-one",
    email="student@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase6-client-id",
)


class FakeResult:
    def __init__(self, row):
        self.row = row

    def mappings(self):
        return self

    def one(self):
        return self.row

    def one_or_none(self):
        return self.row

    def scalar_one(self):
        return self.row


class FakeSession:
    def __init__(self, rows):
        self.rows = list(rows)
        self.calls: list[tuple[str, dict[str, object]]] = []
        self.commits = 0
        self.rollbacks = 0

    def execute(self, statement, parameters=None):
        self.calls.append((str(statement), dict(parameters or {})))
        return FakeResult(self.rows.pop(0))

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def submit_row(application_id: UUID | None = None) -> dict[str, object]:
    return {
        "eligibility_status": "approved",
        "reason_codes": ["eligible"],
        "persisted": True,
        "replayed": False,
        "application_id": application_id or uuid4(),
        "identity_linked": True,
        "drive_access_status": "pending",
        "drive_notification_status": "pending",
    }


def test_production_public_registration_uses_only_bound_rpc() -> None:
    session = FakeSession([submit_row()])

    result = persist_registration(
        session,  # type: ignore[arg-type]
        IDENTITY.to_account_facts(SETTINGS),
        student_registration(),
        "production-rpc-registration-0001",
        settings=SETTINGS,
        identity=IDENTITY,
        source="phase6_authenticated",
    )

    assert result.eligibility.status == EligibilityStatus.APPROVED
    assert result.member_id is None
    assert result.identity_linked is True
    assert session.commits == 1
    assert session.rollbacks == 0
    assert len(session.calls) == 1
    statement, parameters = session.calls[0]
    assert statement == (
        "SELECT * FROM fsl_public_api.submit_registration_v1("
        "CAST(:request AS jsonb), :rpc_token)"
    )
    assert RPC_TOKEN not in statement
    assert parameters["rpc_token"] == RPC_TOKEN
    request = json.loads(str(parameters["request"]))
    assert "rpc_token" not in request
    assert request["rpc_key_version"] == "v1"
    assert request["authentication_subject_hash"] == IDENTITY.subject_hash
    assert request["attestation_signature"] is not None


def test_manual_review_uses_bounded_notification_rpc_before_commit() -> None:
    application_id = uuid4()
    notification_id = uuid4()
    row = submit_row(application_id)
    row.update(
        {
            "eligibility_status": "manual_review",
            "reason_codes": ["faculty_requires_manual_review"],
            "drive_access_status": "not_enqueued",
            "drive_notification_status": "not_applicable",
        }
    )
    session = FakeSession([row, notification_id])

    result = persist_registration(
        session,  # type: ignore[arg-type]
        IDENTITY.to_account_facts(SETTINGS),
        student_registration(faculty="other"),
        "production-rpc-manual-review-0001",
        settings=SETTINGS,
        identity=IDENTITY,
        source="phase6_authenticated",
    )

    assert result.eligibility.status == EligibilityStatus.MANUAL_REVIEW
    assert session.commits == 1
    assert session.rollbacks == 0
    assert len(session.calls) == 2
    statement, parameters = session.calls[1]
    assert statement == (
        "SELECT fsl_public_api.enqueue_manual_review_notification_v1("
        ":application_id, :authentication_subject_hash, "
        ":candidate_notification_id, :rpc_key_version, :rpc_token)"
    )
    assert parameters["application_id"] == application_id
    assert parameters["authentication_subject_hash"] == IDENTITY.subject_hash
    assert parameters["rpc_key_version"] == "v1"
    assert parameters["rpc_token"] == RPC_TOKEN


def test_production_public_never_falls_back_to_orm() -> None:
    session = FakeSession([])
    unsafe = SETTINGS.model_copy(
        update={"public_database_access_mode": "orm"}
    )

    with pytest.raises(
        PublicRegistrationRpcBoundaryError,
        match="public_registration_rpc_unavailable",
    ):
        persist_registration(
            session,  # type: ignore[arg-type]
            IDENTITY.to_account_facts(unsafe),
            student_registration(),
            "production-rpc-registration-0002",
            settings=unsafe,
            identity=IDENTITY,
            source="phase6_authenticated",
        )

    assert session.calls == []


def test_status_rpc_binds_subject_and_capability_without_pii_query() -> None:
    application_id = uuid4()
    session = FakeSession(
        [
            {
                "application_id": application_id,
                "drive_access_status": "granted",
                "drive_notification_status": "sent_by_drive",
            }
        ]
    )

    result = fetch_public_registration_status_v1(
        session,  # type: ignore[arg-type]
        application_id=application_id,
        authentication_subject_hash=IDENTITY.subject_hash,
        settings=SETTINGS,
    )

    assert result is not None
    assert result.application_id == application_id
    statement, parameters = session.calls[0]
    assert "fsl_public_api.registration_status_v1" in statement
    assert "library_applications" not in statement
    assert RPC_TOKEN not in statement
    assert parameters == {
        "application_id": application_id,
        "authentication_subject_hash": IDENTITY.subject_hash,
        "rpc_key_version": "v1",
        "rpc_token": RPC_TOKEN,
    }


def test_status_rpc_zero_rows_does_not_disclose_registration() -> None:
    session = FakeSession([None])

    result = fetch_public_registration_status_v1(
        session,  # type: ignore[arg-type]
        application_id=uuid4(),
        authentication_subject_hash="0" * 64,
        settings=SETTINGS,
    )

    assert result is None


def test_rpc_response_with_unknown_reason_fails_closed() -> None:
    row = submit_row()
    row["reason_codes"] = ["database-injected-unknown-reason"]
    session = FakeSession([row])

    with pytest.raises(
        PublicRegistrationRpcBoundaryError,
        match="public_registration_rpc_invalid_response",
    ):
        persist_registration(
            session,  # type: ignore[arg-type]
            IDENTITY.to_account_facts(SETTINGS),
            student_registration(),
            "production-rpc-registration-0003",
            settings=SETTINGS,
            identity=IDENTITY,
            source="phase6_authenticated",
        )
    assert session.commits == 0
    assert session.rollbacks == 1
