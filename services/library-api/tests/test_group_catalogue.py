from copy import deepcopy
import pytest
from sqlalchemy import select, func

from app.db.models import LibraryAccessGroup, LibraryResourceGroupGrant
from app.drive_client import DrivePermission, DriveClientError
from scripts.group_catalogue import validate_catalogue, verify_and_record
from tests.test_group_access import FakeGroups, FakeDriveClient

CATALOGUE = [{
    "group_name": "groups/testA", "group_email": "testa@groups.example.test",
    "cohort_key": "ug-2023", "shard": 1, "capacity": 800,
}]


@pytest.mark.parametrize(("field", "value"), [
    ("capacity", True), ("capacity", 801), ("shard", False),
    ("group_name", "https://example.test"), ("group_email", None),
    ("cohort_key", "arbitrary"), ("group_email", "UPPER@example.test"),
])
def test_invalid_catalogue_is_rejected(field, value):
    entries = deepcopy(CATALOGUE)
    entries[0][field] = value
    with pytest.raises(ValueError):
        validate_catalogue(entries)


def test_catalogue_verification_and_apply_have_no_external_writes(session):
    drive, groups = FakeDriveClient(), FakeGroups()
    groups.count_members = lambda _: 2  # Pre-existing owner/manager count included.
    drive.permissions["testa@groups.example.test"] = DrivePermission("shared-testA", "reader", "group")
    result = verify_and_record(session, CATALOGUE, groups, drive, "synthetic-folder")
    assert result["recorded"] is False
    assert session.scalar(select(func.count()).select_from(LibraryAccessGroup)) == 0
    verify_and_record(session, CATALOGUE, groups, drive, "synthetic-folder", apply=True)
    verify_and_record(session, CATALOGUE, groups, drive, "synthetic-folder", apply=True)
    assert session.scalar(select(LibraryAccessGroup)).reserved_count == 2
    assert session.scalar(select(func.count()).select_from(LibraryResourceGroupGrant)) == 1
    assert drive.create_calls == drive.delete_calls == groups.add_calls == groups.remove_calls == 0


def test_catalogue_never_invents_a_missing_drive_binding(session):
    groups = FakeGroups()
    with pytest.raises(DriveClientError, match="binding_unverified"):
        verify_and_record(session, CATALOGUE, groups, FakeDriveClient(), "synthetic-folder", apply=True)
    assert session.scalar(select(func.count()).select_from(LibraryAccessGroup)) == 0
