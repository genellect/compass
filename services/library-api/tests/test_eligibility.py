import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.eligibility import evaluate_eligibility, is_student_number_valid
from app.main import app
from app.schemas import EligibilityRequest


CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "library-registration"
    / "eligibility-cases.json"
)
CONTRACT_CASES = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CONTRACT_CASES, ids=lambda case: case["name"])
def test_shared_eligibility_contract(case: dict[str, object]) -> None:
    request = EligibilityRequest.model_validate(
        {
            "account": case["account"],
            "registration": case["registration"],
            "existingRegistration": case["existingRegistration"],
        }
    )
    result = evaluate_eligibility(
        request.account,
        request.registration,
        request.existing_registration,
    )

    assert result.status.value == case["expectedStatus"]
    assert [reason.value for reason in result.reasons] == case["expectedReasons"]
    assert result.normalized_student_number == case["expectedStudentNumber"]


def test_internal_whitespace_is_not_removed() -> None:
    assert not is_student_number_valid("PP 23000")


def test_phase3_api_contract() -> None:
    case = next(
        candidate
        for candidate in CONTRACT_CASES
        if candidate["expectedStatus"] == "approved"
    )
    response = TestClient(app).post(
        "/phase3/evaluate",
        json={
            "account": case["account"],
            "registration": case["registration"],
            "existingRegistration": case["existingRegistration"],
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert response.json()["normalizedStudentNumber"] == "PP23000"
