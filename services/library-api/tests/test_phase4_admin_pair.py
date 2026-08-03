from scripts.verify_phase4_admin_pair import build_admin_pair_evidence


def evidence(role: str, fingerprint: str) -> dict[str, object]:
    return {
        "status": "pass",
        "role_label": role,
        "hosted_domain": "st.kitasato-u.ac.jp",
        "expected_hd_match": True,
        "subject_fingerprint_sha256_16": fingerprint,
    }


def test_distinct_admin_pair_passes() -> None:
    result = build_admin_pair_evidence(
        evidence("primary-admin", "1111111111111111"),
        evidence("secondary-admin", "2222222222222222"),
    )

    assert result["status"] == "pass"
    assert result["distinct_subjects"] is True


def test_same_google_subject_is_blocked() -> None:
    result = build_admin_pair_evidence(
        evidence("primary-admin", "1111111111111111"),
        evidence("secondary-admin", "1111111111111111"),
    )

    assert result["status"] == "blocked"
    assert result["distinct_subjects"] is False


def test_wrong_hosted_domain_is_blocked() -> None:
    secondary = evidence("secondary-admin", "2222222222222222")
    secondary["hosted_domain"] = "example.ac.jp"

    result = build_admin_pair_evidence(
        evidence("primary-admin", "1111111111111111"),
        secondary,
    )

    assert result["status"] == "blocked"
    assert result["expected_hd_match"] is False


def test_role_labels_cannot_be_reused_or_swapped() -> None:
    result = build_admin_pair_evidence(
        evidence("secondary-admin", "1111111111111111"),
        evidence("primary-admin", "2222222222222222"),
    )

    assert result["status"] == "blocked"
    assert result["roles_match"] is False
