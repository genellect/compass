"""Durable cohort reservations and scoped group operations.

The old access-grant row remains an API/notification receipt. Group receipts
never hold a Drive permission ID: the shared ACL belongs to the group table.
"""
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.db.models import LibraryAccessGroup, LibraryGroupMembership, LibraryResourceGroupGrant
from app.drive_attestation import DRIVE_TARGET_ALIAS
from app.drive_client import DriveClientError
from app.group_policy import GROUP, GRANT_TYPES, cohort_key
from app.groups_client import GoogleGroupsClient


def reserve_membership(session, member, allowed_ids):
    if member.access_strategy != GROUP:
        raise DriveClientError("legacy_member_group_forbidden", retryable=False)
    existing = session.scalar(select(LibraryGroupMembership).where(
        LibraryGroupMembership.member_id == member.id))
    if existing:
        return existing
    key = cohort_key(member.normalized_student_number, member.academic_role)
    candidates = session.scalars(select(LibraryAccessGroup).where(
        LibraryAccessGroup.cohort_key == key,
        LibraryAccessGroup.state == "ready",
        LibraryAccessGroup.google_group_name.in_(allowed_ids),
        LibraryAccessGroup.reserved_count < LibraryAccessGroup.capacity,
    ).order_by(LibraryAccessGroup.shard).with_for_update()).all()
    for group in candidates:
        changed = session.execute(update(LibraryAccessGroup).where(
            LibraryAccessGroup.id == group.id,
            LibraryAccessGroup.reserved_count < LibraryAccessGroup.capacity,
        ).values(reserved_count=LibraryAccessGroup.reserved_count + 1))
        if changed.rowcount == 1:
            membership = LibraryGroupMembership(member_id=member.id, group_id=group.id)
            session.add(membership)
            session.flush()
            return membership
    raise DriveClientError("group_capacity_unavailable", retryable=True)


def group_entitlement_verified(session, member) -> bool:
    if member.access_strategy != GROUP:
        return True
    return session.scalar(select(LibraryGroupMembership.id).where(
        LibraryGroupMembership.member_id == member.id,
        LibraryGroupMembership.state == "active",
        LibraryGroupMembership.verified_at.is_not(None),
        LibraryGroupMembership.google_membership_name.is_not(None),
    )) is not None


def managed_membership_component(session, member):
    membership = session.scalar(select(LibraryGroupMembership).where(
        LibraryGroupMembership.member_id == member.id))
    if not membership or not membership.managed_by_system or not membership.google_membership_name:
        raise DriveClientError("permission_not_managed", retryable=False)
    return str(membership.id)


def process_group_operation(session, operation, member, grant, drive, settings, groups=None):
    # Late imports reuse the exact individual path's row lock and completion
    # transaction without a second scheduler or notification pipeline.
    from app.drive_operations import _lock_member_for_update, _finish_success
    from app.drive_attestation import build_drive_operation_attestation_facts, verify_drive_operation_attestation
    from app.db.models import LibraryApplication

    if not settings.group_worker_enabled:
        raise DriveClientError("group_worker_disabled", retryable=True)
    allowed = settings._csv_values(settings.google_groups_allowed_ids)
    groups = groups or GoogleGroupsClient(settings)
    member = _lock_member_for_update(session, member.id, settings)
    if member is None or member.access_strategy != GROUP or not member.normalized_email:
        raise DriveClientError("operation_state_invalid", retryable=False)
    adding = operation.operation_type in GRANT_TYPES
    if adding:
        if member.member_status != "active":
            raise DriveClientError("member_inactive", retryable=False)
        membership = reserve_membership(session, member, allowed)
    else:
        membership = session.scalar(select(LibraryGroupMembership).where(
            LibraryGroupMembership.member_id == member.id))
        if not membership:
            raise DriveClientError("operation_state_invalid", retryable=False)
    # Persist capacity reservation before any external write. Never assign a
    # different shard after a timeout, a restart, or a retry.
    session.commit()
    member = _lock_member_for_update(session, member.id, settings)
    application = session.get(LibraryApplication, operation.application_id) if adding else None
    facts = build_drive_operation_attestation_facts(session, operation, member, grant, application)
    verify_drive_operation_attestation(
        operation, facts=facts, key=settings.drive_operation_attestation_key,
        ttl_seconds=settings.drive_operation_attestation_ttl_seconds, allow_consumed=True,
    )
    group = session.get(LibraryAccessGroup, membership.group_id)
    if group.google_group_name not in allowed or (adding and group.state != "ready"):
        raise DriveClientError("group_not_allowlisted", retryable=False)
    groups.verify_group(group.google_group_name, group.group_email)
    if adding:
        binding = session.scalar(select(LibraryResourceGroupGrant).where(
            LibraryResourceGroupGrant.group_id == group.id,
            LibraryResourceGroupGrant.target_alias == DRIVE_TARGET_ALIAS))
        permission = drive.find_permission(settings.drive_resource_id, group.group_email)
        if (binding is None or permission is None or permission.role != "reader"
            or permission.principal_type != "group" or permission.permission_id != binding.permission_id):
            raise DriveClientError("group_drive_binding_unverified", retryable=True)
        existing = groups.find_member(group.google_group_name, member.normalized_email)
        if existing is None:
            created = groups.add_member(group.google_group_name, member.normalized_email)
            membership.google_membership_name = created.name
            membership.managed_by_system = True
            # Save a successful create before readback. Lost-response recovery
            # leaves pre-existing/unprovable membership unmanaged.
            session.commit()
            member = _lock_member_for_update(session, member.id, settings)
            if member.member_status != "active":
                raise DriveClientError("member_inactive", retryable=False)
            existing = groups.find_member(group.google_group_name, member.normalized_email)
        if existing is None or existing.roles != {"MEMBER"} or existing.email != member.normalized_email:
            raise DriveClientError("group_membership_pending", retryable=True)
        if membership.google_membership_name and membership.google_membership_name != existing.name:
            raise DriveClientError("group_membership_mismatch", retryable=False)
        membership.google_membership_name = existing.name
        membership.state = "active"
        membership.verified_at = datetime.now(UTC)
        grant.status = "granted"
        grant.granted_at = datetime.now(UTC)
        grant.permission_id = None
        grant.managed_by_system = False
        # There was no per-user Drive invitation. The existing GAS success
        # outbox sends the approved HTML link instead.
        grant.notification_status = "not_applicable"
    else:
        if membership.state != "removed":
            managed_membership_component(session, member)
            groups.remove_member(group.google_group_name, membership.google_membership_name, member.normalized_email)
            membership.state = "removed"
            membership.removed_at = datetime.now(UTC)
        grant.status = "revoked"
        grant.revoked_at = datetime.now(UTC)
    session.flush()
    return _finish_success(session, operation)
