from datetime import UTC, datetime, timedelta
from dataclasses import replace
from uuid import uuid4

import pytest
from sqlalchemy import select, func

from app.db.models import (
    LibraryMember, LibraryAccessGrant, LibraryAccessGroup, LibraryGroupMembership,
    LibraryResourceGroupGrant, LibraryOperation, LibraryNotificationOutbox,
)
from app.drive_client import DriveClientError, DrivePermission
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.drive_operations import process_due_drive_operations, enqueue_drive_revoke
from app.group_operations import reserve_membership
from app.group_policy import cohort_key, new_member_strategy
from app.groups_client import GroupMembership
from app.registration_service import persist_registration
from tests.factories import student_account, student_registration
from tests.test_phase7_drive_operations import SETTINGS, STUDENT_IDENTITY, FakeDriveClient, make_retry_due

CONFIG = SETTINGS.model_copy(update={
    "group_access_enabled": True, "group_worker_enabled": True,
    "group_access_cutover_at": datetime(2026, 1, 1, tzinfo=UTC),
    "google_groups_allowed_ids": "groups/testA,groups/testB",
})


class FakeGroups:
    def __init__(self):
        self.members = {}
        self.add_calls = 0
        self.remove_calls = 0
        self.failure_after_write = None
        self.failure_before_write = None

    def verify_group(self, group, email):
        assert group in {"groups/testA", "groups/testB"}
        assert email.endswith("@groups.example.test")

    def find_member(self, group, email):
        return self.members.get((group, email))

    def add_member(self, group, email):
        self.add_calls += 1
        if self.failure_before_write:
            raise self.failure_before_write
        membership = GroupMembership(group + "/memberships/" + uuid4().hex, email, frozenset({"MEMBER"}))
        self.members[group, email] = membership
        if self.failure_after_write:
            error = self.failure_after_write
            self.failure_after_write = None
            raise error
        return membership

    def remove_member(self, group, name, email):
        assert self.members[group, email].name == name
        self.remove_calls += 1
        del self.members[group, email]


def provision(session, drive, *, capacity=800, shard=1):
    name = "testA" if shard == 1 else "testB"
    group = LibraryAccessGroup(
        google_group_name="groups/" + name, group_email=name.lower() + "@groups.example.test",
        cohort_key="ug-2023", shard=shard, capacity=capacity, state="ready", reserved_count=0,
    )
    session.add(group)
    session.flush()
    drive.permissions[group.group_email] = DrivePermission("shared-" + name, "reader", "group")
    session.add(LibraryResourceGroupGrant(group_id=group.id, target_alias=DRIVE_TARGET_ALIAS,
        permission_id="shared-" + name, role="reader", verified_at=datetime.now(UTC)))
    session.commit()
    return group


def register(session, settings=CONFIG, number=0):
    email = f"synthetic{number}@st.kitasato-u.ac.jp"
    identity = replace(STUDENT_IDENTITY, google_sub=f"group-sub-{number}", email=email)
    return persist_registration(session, student_account(email=email),
        student_registration(student_number=f"PP23{number:03d}"), f"group-registration-{number:04d}",
        settings=settings, identity=identity)


def run(session, drive, groups, settings=CONFIG):
    return process_due_drive_operations(session, drive, settings, limit=20, groups_client=groups)


@pytest.mark.parametrize(("number", "role", "expected"), [
    ("PP23000", "undergraduate", "ug-2023"), ("PL26001", "undergraduate", "ug-2026"),
    ("MP25001", "master", "master-2025"), (None, "faculty_staff", "special-approved"),
])
def test_cohort(number, role, expected):
    assert cohort_key(number, role) == expected


def test_cutover_is_new_member_only_and_time_bound(session):
    before = CONFIG.group_access_cutover_at - timedelta(seconds=1)
    assert new_member_strategy(CONFIG, before) == "legacy_individual"
    assert new_member_strategy(CONFIG, CONFIG.group_access_cutover_at) == "group_membership"
    old = register(session, SETTINGS)
    repeated = register(session, CONFIG)
    assert old.member_id == repeated.member_id
    member = session.get(LibraryMember, old.member_id)
    assert member.access_strategy == "legacy_individual"
    assert session.scalar(select(func.count()).select_from(LibraryGroupMembership)) == 0
    member.access_strategy = "group_membership"
    with pytest.raises(ValueError, match="immutable"):
        session.commit()
    session.rollback()


def test_new_member_add_and_revoke_never_mutate_drive_acl(session):
    drive, groups = FakeDriveClient(), FakeGroups()
    provision(session, drive)
    result = register(session)
    assert session.scalar(select(LibraryOperation)).operation_type == "group_membership_add"
    assert run(session, drive, groups)[0].status == "succeeded"
    assert run(session, drive, groups) == []
    membership = session.scalar(select(LibraryGroupMembership))
    grant = session.scalar(select(LibraryAccessGrant))
    assert membership.state == "active"
    assert groups.add_calls == 1
    assert grant.permission_id is None and not grant.managed_by_system
    assert session.scalar(select(func.count()).select_from(LibraryNotificationOutbox)) == 1
    operation = enqueue_drive_revoke(session, result.member_id, CONFIG)
    assert operation.operation_type == "group_membership_remove"
    assert run(session, drive, groups)[0].status == "succeeded"
    assert membership.state == "removed"
    assert groups.remove_calls == 1
    assert drive.create_calls == drive.delete_calls == 0
    assert len(drive.permissions) == 1


def test_disabled_worker_leaves_new_group_work_pending(session):
    drive, groups = FakeDriveClient(), FakeGroups()
    provision(session, drive)
    register(session)
    assert run(session, drive, groups, CONFIG.model_copy(update={"group_worker_enabled": False})) == []
    assert session.scalar(select(LibraryOperation)).status == "pending"
    assert drive.create_calls == groups.add_calls == 0


def test_missing_binding_and_capacity_do_not_fall_back_or_notify(session):
    drive, groups = FakeDriveClient(), FakeGroups()
    register(session)
    assert run(session, drive, groups)[0].error_code == "group_capacity_unavailable"
    operation = session.scalar(select(LibraryOperation))
    provision(session, drive)
    drive.permissions.clear()
    make_retry_due(session, operation)
    assert run(session, drive, groups)[0].error_code == "group_drive_binding_unverified"
    assert drive.create_calls == groups.add_calls == 0
    assert session.scalar(select(func.count()).select_from(LibraryNotificationOutbox)) == 0


def test_lost_response_reconciles_without_duplicate_or_claiming_ownership(session):
    drive, groups = FakeDriveClient(), FakeGroups()
    group = provision(session, drive)
    register(session)
    groups.failure_after_write = DriveClientError("group_membership_pending", retryable=True)
    assert run(session, drive, groups)[0].status == "failed"
    operation = session.scalar(select(LibraryOperation))
    make_retry_due(session, operation)
    assert run(session, drive, groups)[0].status == "succeeded"
    assert groups.add_calls == 1
    assert group.reserved_count == 1
    assert not session.scalar(select(LibraryGroupMembership)).managed_by_system
    assert drive.create_calls == 0


def test_two_hundred_reservations_branch_at_800_and_retries_are_stable(session):
    drive = FakeDriveClient()
    first = provision(session, drive)
    first.reserved_count = 799
    second = provision(session, drive, shard=2)
    for i in range(200):
        member = LibraryMember(id=uuid4(), full_name="Synthetic", academic_role="undergraduate",
            faculty_code="pharmacy", normalized_student_number=f"PP23{i:03d}",
            member_status="active", access_strategy="group_membership")
        session.add(member)
        session.flush()
        membership = reserve_membership(session, member, ("groups/testA", "groups/testB"))
        assert reserve_membership(session, member, ("groups/testA", "groups/testB")).id == membership.id
        session.commit()
    session.refresh(first)
    session.refresh(second)
    assert (first.reserved_count, second.reserved_count) == (800, 199)
    assert session.scalar(select(func.count()).select_from(LibraryGroupMembership)) == 200


def test_legacy_cannot_be_reserved(session):
    result = register(session, SETTINGS)
    with pytest.raises(DriveClientError, match="legacy_member_group_forbidden"):
        reserve_membership(session, session.get(LibraryMember, result.member_id), ("groups/testA",))


def test_new_request_for_existing_legacy_member_does_not_change_strategy(session):
    original = register(session, SETTINGS)
    identity = replace(STUDENT_IDENTITY, google_sub="group-sub-0", email="synthetic0@st.kitasato-u.ac.jp")
    repeated = persist_registration(session, student_account(email=identity.email),
        student_registration(), "different-application-same-legacy-user",
        settings=CONFIG, identity=identity)
    assert repeated.member_id == original.member_id
    assert session.get(LibraryMember, original.member_id).access_strategy == "legacy_individual"
    assert session.scalar(select(func.count()).select_from(LibraryGroupMembership)) == 0


def test_paused_group_still_allows_removal_of_managed_member(session):
    drive, groups = FakeDriveClient(), FakeGroups()
    group = provision(session, drive)
    result = register(session)
    assert run(session, drive, groups)[0].status == "succeeded"
    group.state = "paused"
    session.commit()
    enqueue_drive_revoke(session, result.member_id, CONFIG)
    assert run(session, drive, groups)[0].status == "succeeded"
    assert groups.remove_calls == 1 and drive.delete_calls == 0


def test_staff_waits_for_manual_approval_before_group_membership(session, monkeypatch):
    from app.admin_service import AdminPrincipal, decide_application
    from app.db.models import LibraryAdmin
    from app.schemas import AdminDecisionRequest
    from tests import test_phase8_admin_api as admin_tests
    settings = admin_tests.SETTINGS.model_copy(update={
        "group_access_enabled": True, "group_worker_enabled": True,
        "group_access_cutover_at": CONFIG.group_access_cutover_at,
        "google_groups_allowed_ids": CONFIG.google_groups_allowed_ids,
    })
    monkeypatch.setattr(admin_tests, "SETTINGS", settings)
    application = admin_tests._seed_manual_application(session)
    assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 0
    drive, groups = FakeDriveClient(), FakeGroups()
    group = provision(session, drive)
    group.cohort_key = "special-approved"
    admin = LibraryAdmin(google_sub="synthetic-group-admin", role="admin", active=True)
    session.add(admin)
    session.commit()
    decide_application(session, settings, AdminPrincipal(admin.id, "admin"), application.id,
        AdminDecisionRequest(decision="approve", reason="Synthetic staff approval",
                             expected_record_version=application.record_version),
        idempotency_key="group-manual-approval-001", request_id="synthetic-request")
    assert session.scalar(select(LibraryOperation)).operation_type == "group_membership_add"
    assert run(session, drive, groups, settings)[0].status == "succeeded"
    assert groups.add_calls == 1 and drive.create_calls == 0
