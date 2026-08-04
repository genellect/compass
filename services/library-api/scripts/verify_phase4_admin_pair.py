from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


EXPECTED_HD = "st.kitasato-u.ac.jp"
EXPECTED_ROLES = ("primary-admin", "secondary-admin")


def build_admin_pair_evidence(
    primary: dict[str, Any],
    secondary: dict[str, Any],
) -> dict[str, object]:
    fingerprints = (
        str(primary.get("subject_fingerprint_sha256_16") or ""),
        str(secondary.get("subject_fingerprint_sha256_16") or ""),
    )
    role_labels = (
        str(primary.get("role_label") or ""),
        str(secondary.get("role_label") or ""),
    )
    individual_evidence_pass = all(
        evidence.get("status") == "pass"
        for evidence in (primary, secondary)
    )
    expected_hd_match = all(
        evidence.get("hosted_domain") == EXPECTED_HD
        and evidence.get("expected_hd_match") is True
        for evidence in (primary, secondary)
    )
    distinct_subjects = all(fingerprints) and fingerprints[0] != fingerprints[1]
    roles_match = role_labels == EXPECTED_ROLES
    passed = all(
        (
            individual_evidence_pass,
            expected_hd_match,
            distinct_subjects,
            roles_match,
        )
    )

    return {
        "status": "pass" if passed else "blocked",
        "purpose": "phase4_admin_pair_evidence_only",
        "production_authorization": False,
        "captured_at_utc": datetime.now(UTC).isoformat(),
        "individual_evidence_pass": individual_evidence_pass,
        "expected_hd": EXPECTED_HD,
        "expected_hd_match": expected_hd_match,
        "role_labels": list(role_labels),
        "roles_match": roles_match,
        "distinct_subjects": distinct_subjects,
        "primary_subject_fingerprint_sha256_16": fingerprints[0] or None,
        "secondary_subject_fingerprint_sha256_16": fingerprints[1] or None,
        "manual_checks_still_required": [
            "formal_nomination",
            "mfa_enabled",
            "emergency_contact_reachable",
        ],
    }


def load_evidence(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Evidence must be a JSON object: {path}")
    forbidden_keys = {"email", "sub", "id_token", "access_token", "refresh_token"}
    if forbidden_keys.intersection(payload):
        raise ValueError(f"Raw identifier or token found in evidence: {path}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compare sanitized Phase 4 primary/secondary admin evidence."
    )
    parser.add_argument("primary", type=Path)
    parser.add_argument("secondary", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = build_admin_pair_evidence(
        load_evidence(args.primary),
        load_evidence(args.secondary),
    )
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
