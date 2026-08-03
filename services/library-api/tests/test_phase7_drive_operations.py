from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryIdentity,
    LibraryMember,
    LibraryOperation,
    LibraryResourceLease,
)
from app.drive_client import (
    DriveClientError,
    DrivePermission,
)
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.drive_operations import (
    drive_access_status_for_application,
    enqueue_drive_revoke,
    process_due_drive_operations,
    requeue_drive_operation,
)
from app.registration_service import persist_registration
from tests.factories import student_account, student_registration


SETTINGS = Settings(
    database_url="sqlite+pysqlite:///:memory:",
    external_side_effects_enabled=True,
    phase7_worker_api_enabled=True,
    phase7_drive_api_enabled=True,
    phase7_drive_kill_switch=False,
    phase7_worker_secret="phase7-test-worker-secret-32-characters",
    phase7_retry_base_seconds=1,
    drive_resource_id="phase7-synthetic-drive",
)
STUDENT_IDENTITY = VerifiedGoogleIdentity(
    google_sub="phase7-synthetic-student-sub",
    email="student@st.kitasato-u.ac.jp",
    email_verified=True,
    hosted_domain="st.kitasato-u.ac.jp",
    issuer="https://accounts.google.com",
    audience="phase7-synthetic-registration-client",
)


class FakeDriveClient:
    def __init__(self) -> None:
        self.permissions: dict[str, DrivePermission] = {}
        self.find_failures: list[DriveClientError] = []
        self.create_failure_after_write: DriveClientError | None = None
        self.find_calls = 0
        self.create_calls = 0
        self.delete_calls = 0
        self.find_resources: list[str] = []
        self.create_resources: list[str] = []

    def find_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission | None:
        self.find_calls += 1
        self.find_resources.append(resource_id)
        if self.find_failures:
            raise self.find_failures.pop(0)
        return self.permissions.get(email.lower())

    def create_reader_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission:
        self.create_calls += 1
        self.create_resources.append(resource_id)
        permission = DrivePermission(
            permission_id=f"permission-{self.create_calls}",
            role="reader",
        )
        self.permissions[email.lower()] = permission
        if self.create_failure_after_write is not None:
            error = self.create_failure_after_write
            self.create_failure_after_write = None
            raise error
        return permission

    def delete_permission(
        self,
        _resource_id: str,
        permission_id: str,
    ) -> None:
        self.delete_calls += 1
        for email, permission in list(self.permissions.items()):
            if permission.permission_id == permission_id:
                del self.permissions[email]


def queued_registration(session: Session, key: str = "phase7-registration-0001"):
    result = persist_registration(
        session,
        student_account(),
        student_registration(),
        key,
        settings=SETTINGS,
        identity=STUDENT_IDENTITY,
    )
    grant = session.scalar(select(LibraryAccessGrant))
    operation = session.scalar(select(LibraryOperation))
    assert grant is not None
    assert operation is not None
    assert result.drive_access_status == "pending"
    return result, grant, operation


def make_retry_due(session: Session, operation: LibraryOperation) -> None:
    operation.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()


def test_new_reader_permission_is_created_once_and_notified(
    session: Session,
) -> None:
    _result, grant, operation = queued_registration(session)
    drive = FakeDriveClient()

    first = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=10,
    )
    repeated = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=10,
    )

    session.refresh(grant)
    session.refresh(operation)
    assert [result.status for result in first] == ["succeeded"]
    assert repeated == []
    assert drive.create_calls == 1
    assert grant.status == "granted"
    assert grant.role == "reader"
    assert grant.managed_by_system is True
    assert grant.notification_status == "sent_by_drive"
    assert grant.notification_sent_at is not None
    assert operation.attempt_count == 1
    assert operation.completed_at is not None


def test_existing_writer_is_preserved_without_notification(
    session: Session,
) -> None:
    _result, grant, _operation = queued_registration(session)
    drive = FakeDriveClient()
    drive.permissions["student@st.kitasato-u.ac.jp"] = DrivePermission(
        "existing-writer-permission",
        "writer",
    )

    results = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )

    session.refresh(grant)
    assert results[0].status == "succeeded"
    assert drive.create_calls == 0
    assert grant.status == "already_granted"
    assert grant.role == "writer"
    assert grant.managed_by_system is False
    assert grant.notification_status == "not_applicable"


def test_lost_create_response_recovers_without_duplicate_permission(
    session: Session,
) -> None:
    _result, grant, operation = queued_registration(session)
    drive = FakeDriveClient()
    drive.create_failure_after_write = DriveClientError(
        "drive_api_unavailable",
        retryable=True,
    )

    first = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )
    session.refresh(operation)
    assert first[0].status == "failed"
    assert operation.external_action_started_at is not None
    make_retry_due(session, operation)

    second = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )

    session.refresh(grant)
    assert second[0].status == "succeeded"
    assert drive.create_calls == 1
    assert len(drive.permissions) == 1
    assert grant.managed_by_system is False
    assert grant.status == "already_granted"
    assert grant.notification_status == "not_applicable"


def test_retryable_error_becomes_dead_after_finite_attempts(
    session: Session,
) -> None:
    _result, grant, operation = queued_registration(session)
    drive = FakeDriveClient()
    drive.find_failures = [
        DriveClientError("drive_api_unavailable", retryable=True)
        for _ in range(3)
    ]

    statuses: list[str] = []
    for attempt in range(3):
        result = process_due_drive_operations(
            session,
            drive,
            SETTINGS,
            limit=1,
        )[0]
        statuses.append(result.status)
        session.refresh(operation)
        if attempt < 2:
            make_retry_due(session, operation)

    session.refresh(grant)
    session.refresh(operation)
    assert statuses == ["failed", "failed", "dead"]
    assert operation.attempt_count == 3
    assert operation.error_code == "drive_api_unavailable"
    assert "student@" not in (operation.error_summary or "")
    assert grant.status == "failed"
    assert process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    ) == []


def test_resource_lease_serializes_same_folder_without_consuming_attempt(
    session: Session,
) -> None:
    _result, _grant, operation = queued_registration(session)
    session.add(
        LibraryResourceLease(
            resource_id=SETTINGS.drive_resource_id,
            lease_owner="another-worker",
            locked_until=datetime.now(UTC) + timedelta(minutes=1),
        )
    )
    session.commit()
    drive = FakeDriveClient()

    result = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
        worker_id="current-worker",
    )[0]

    session.refresh(operation)
    assert result.status == "failed"
    assert result.error_code == "resource_busy"
    assert operation.attempt_count == 0
    assert drive.find_calls == 0
    assert drive.create_calls == 0


def test_managed_permission_can_be_revoked_idempotently(
    session: Session,
) -> None:
    result, grant, _operation = queued_registration(session)
    drive = FakeDriveClient()
    process_due_drive_operations(session, drive, SETTINGS, limit=1)
    revoke = enqueue_drive_revoke(session, result.member_id, SETTINGS)

    first = process_due_drive_operations(session, drive, SETTINGS, limit=1)
    replay = enqueue_drive_revoke(session, result.member_id, SETTINGS)

    session.refresh(grant)
    assert first[0].status == "succeeded"
    assert replay.id == revoke.id
    assert drive.delete_calls == 1
    assert grant.status == "revoked"
    assert grant.revoked_at is not None


def test_revoke_never_trusts_a_tampered_database_permission_id(
    session: Session,
) -> None:
    result, grant, _operation = queued_registration(session)
    drive = FakeDriveClient()
    process_due_drive_operations(session, drive, SETTINGS, limit=1)
    enqueue_drive_revoke(session, result.member_id, SETTINGS)
    grant.permission_id = "permission-for-a-different-user"
    drive.permissions["other@st.kitasato-u.ac.jp"] = DrivePermission(
        "permission-for-a-different-user",
        "reader",
    )
    session.commit()

    revoke = process_due_drive_operations(session, drive, SETTINGS, limit=1)[0]

    session.refresh(grant)
    assert revoke.status == "dead"
    assert revoke.error_code == "permission_not_managed"
    assert drive.find_calls == 2
    assert drive.delete_calls == 0
    assert "student@st.kitasato-u.ac.jp" in drive.permissions
    assert "other@st.kitasato-u.ac.jp" in drive.permissions


def test_existing_unmanaged_permission_is_never_deleted(
    session: Session,
) -> None:
    result, grant, _operation = queued_registration(session)
    drive = FakeDriveClient()
    drive.permissions["student@st.kitasato-u.ac.jp"] = DrivePermission(
        "existing-reader-permission",
        "reader",
    )
    process_due_drive_operations(session, drive, SETTINGS, limit=1)
    enqueue_drive_revoke(session, result.member_id, SETTINGS)

    revoke = process_due_drive_operations(session, drive, SETTINGS, limit=1)[0]

    session.refresh(grant)
    assert revoke.status == "dead"
    assert revoke.error_code == "permission_not_managed"
    assert drive.delete_calls == 0
    assert grant.status == "already_granted"


def test_inactive_member_is_never_granted_drive_access(
    session: Session,
    capsys,
) -> None:
    result, grant, _operation = queued_registration(session)
    member = session.get(LibraryMember, result.member_id)
    assert member is not None
    member.member_status = "inactive"
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )

    session.refresh(grant)
    event = capsys.readouterr().out
    assert processed[0].status == "dead"
    assert processed[0].error_code == "member_inactive"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert grant.status == "failed"
    assert '"event":"drive_operation_dead"' in event
    assert '"error_code":"member_inactive"' in event
    assert "student@" not in event
    assert "PP23000" not in event


def test_member_without_linked_email_fails_before_drive_communication(
    session: Session,
) -> None:
    result, grant, operation = queued_registration(session)
    member = session.get(LibraryMember, result.member_id)
    assert member is not None
    member.normalized_email = None
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )

    session.refresh(grant)
    session.refresh(operation)
    assert processed[0].status == "dead"
    assert processed[0].error_code == "member_email_unlinked"
    assert operation.external_action_started_at is None
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0
    assert grant.status == "failed"


def test_member_deactivated_after_lookup_is_rechecked_before_create(
    session: Session,
) -> None:
    result, grant, _operation = queued_registration(session)
    member = session.get(LibraryMember, result.member_id)
    assert member is not None

    class DeactivatingOnLookupClient(FakeDriveClient):
        def find_permission(
            self,
            resource_id: str,
            email: str,
        ) -> DrivePermission | None:
            existing = super().find_permission(resource_id, email)
            member.member_status = "inactive"
            session.commit()
            return existing

    drive = DeactivatingOnLookupClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )

    session.refresh(grant)
    assert processed[0].status == "dead"
    assert processed[0].error_code == "member_inactive"
    assert drive.find_calls == 1
    assert drive.create_calls == 0
    assert grant.status == "failed"


def test_ten_registration_replays_keep_one_grant_and_one_operation(
    session: Session,
) -> None:
    for _ in range(10):
        persist_registration(
            session,
            student_account(),
            student_registration(),
            "phase7-ten-replays-0001",
            settings=SETTINGS,
        )

    assert session.scalar(
        select(func.count()).select_from(LibraryAccessGrant)
    ) == 1
    assert session.scalar(
        select(func.count()).select_from(LibraryOperation)
    ) == 1


def test_new_drive_operation_has_versioned_attestation(
    session: Session,
) -> None:
    _result, _grant, operation = queued_registration(session)

    assert operation.target_alias == DRIVE_TARGET_ALIAS
    assert operation.resource_id is None
    assert operation.attestation_version == "v1"
    assert operation.attestation_issued_at is not None
    assert len(operation.attestation_nonce or "") == 64
    assert len(operation.attestation_signature or "") == 64
    assert operation.attestation_consumed_at is None


def test_missing_attestation_is_dead_before_drive_call(
    session: Session,
) -> None:
    _result, _grant, operation = queued_registration(session)
    operation.attestation_signature = None
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_attestation_missing"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_modified_attestation_is_dead_before_drive_call(
    session: Session,
) -> None:
    _result, _grant, operation = queued_registration(session)
    operation.attestation_signature = "0" * 64
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_attestation_invalid"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_unlinked_identity_fails_closed_before_drive_call(
    session: Session,
) -> None:
    _result, _grant, _operation = queued_registration(session)
    identity = session.scalar(select(LibraryIdentity))
    assert identity is not None
    identity.unlinked_at = datetime.now(UTC)
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_state_invalid"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_identity_subject_mismatch_fails_closed_before_drive_call(
    session: Session,
) -> None:
    result, _grant, _operation = queued_registration(session)
    application = session.get(LibraryApplication, result.application_id)
    assert application is not None
    application.authentication_subject_hash = "0" * 64
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_state_invalid"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_consent_removal_fails_closed_before_drive_call(
    session: Session,
) -> None:
    result, _grant, _operation = queued_registration(session)
    application = session.get(LibraryApplication, result.application_id)
    assert application is not None
    application.privacy_accepted_at = None
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_state_invalid"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_eligibility_facts_are_bound_against_database_tampering(
    session: Session,
) -> None:
    result, _grant, _operation = queued_registration(session)
    application = session.get(LibraryApplication, result.application_id)
    member = session.get(LibraryMember, result.member_id)
    assert application is not None
    assert member is not None
    application.grade = "4"
    member.grade = "4"
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_attestation_invalid"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_expired_attestation_is_dead_before_drive_call(
    session: Session,
) -> None:
    _result, _grant, operation = queued_registration(session)
    assert operation.attestation_issued_at is not None
    operation.attestation_issued_at -= (
        SETTINGS.drive_operation_attestation_ttl_seconds + 1
    )
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert processed.status == "dead"
    assert processed.error_code == "operation_attestation_expired"
    assert drive.find_calls == 0
    assert drive.create_calls == 0
    assert drive.delete_calls == 0


def test_consumed_attestation_replay_is_dead_without_second_drive_call(
    session: Session,
) -> None:
    _result, _grant, operation = queued_registration(session)
    drive = FakeDriveClient()
    first = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]
    assert first.status == "succeeded"
    first_find_calls = drive.find_calls
    first_create_calls = drive.create_calls

    operation.status = "pending"
    operation.completed_at = None
    session.commit()
    replay = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]

    assert replay.status == "dead"
    assert replay.error_code == "operation_attestation_replayed"
    assert drive.find_calls == first_find_calls
    assert drive.create_calls == first_create_calls
    assert drive.delete_calls == 0


def test_dead_operation_can_be_manually_requeued(
    session: Session,
) -> None:
    _result, grant, operation = queued_registration(session)
    drive = FakeDriveClient()
    drive.find_failures = [
        DriveClientError("drive_permission_denied", retryable=False)
    ]

    failed = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]
    assert failed.status == "dead"

    replay = requeue_drive_operation(session, operation.id, SETTINGS)
    session.refresh(grant)
    assert replay.status == "pending"
    assert replay.attempt_count == 0
    assert replay.error_code is None

    recovered = process_due_drive_operations(
        session,
        drive,
        SETTINGS,
        limit=1,
    )[0]
    session.refresh(grant)
    assert recovered.status == "succeeded"
    assert grant.status == "granted"


def test_worker_ignores_database_resource_and_uses_fixed_runtime_target(
    session: Session,
) -> None:
    result, grant, operation = queued_registration(session)
    changed_settings = SETTINGS.model_copy(
        update={"drive_resource_id": "different-runtime-resource"}
    )
    operation.resource_id = "attacker-controlled-operation-resource"
    grant.resource_id = "attacker-controlled-grant-resource"
    session.commit()
    drive = FakeDriveClient()

    processed = process_due_drive_operations(
        session,
        drive,
        changed_settings,
        limit=1,
    )
    application = session.get(LibraryApplication, result.application_id)

    session.refresh(operation)
    session.refresh(grant)
    assert processed[0].status == "succeeded"
    assert operation.target_alias == DRIVE_TARGET_ALIAS
    assert grant.target_alias == DRIVE_TARGET_ALIAS
    assert drive.find_resources == [changed_settings.drive_resource_id]
    assert drive.create_resources == [changed_settings.drive_resource_id]
    assert application is not None
    assert drive_access_status_for_application(
        session,
        application,
        DRIVE_TARGET_ALIAS,
    ) == ("granted", "sent_by_drive")
