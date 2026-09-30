"""New-member-only access routing; never changes eligibility or existing access."""
from datetime import UTC, datetime
import re

LEGACY = "legacy_individual"
GROUP = "group_membership"
GRANT_TYPES = {"drive_grant", "group_membership_add", "group_membership_reconcile"}
REVOKE_TYPES = {"drive_revoke", "group_membership_remove"}
GROUP_TYPES = {"group_membership_add", "group_membership_remove", "group_membership_reconcile"}


def new_member_strategy(settings, now: datetime) -> str:
    if not settings.group_access_enabled:
        return LEGACY
    cutoff = settings.group_access_cutover_at
    if cutoff is None or cutoff.utcoffset() is None:
        raise ValueError("GROUP_ACCESS_CUTOVER_AT must include a timezone")
    return GROUP if now.astimezone(UTC) >= cutoff.astimezone(UTC) else LEGACY


def grant_operation_type(strategy: str) -> str:
    return "group_membership_add" if strategy == GROUP else "drive_grant"


def cohort_key(student_number: str | None, academic_role: str) -> str:
    # Cohort is stable: grade changes do not move memberships or reject users.
    match = re.fullmatch(r"(PP|PL|MP)([0-9]{2})[0-9]{3}", student_number or "")
    if academic_role not in {"undergraduate", "master"} or match is None:
        return "special-approved"
    kind = "master" if match[1] == "MP" else "ug"
    return f"{kind}-{2000 + int(match[2])}"
