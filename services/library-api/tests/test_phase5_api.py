from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db.session import get_session
from app.main import app
from tests.factories import student_account, student_registration


def test_phase5_registration_api_persists_and_replays(
    engine,
    monkeypatch,
) -> None:
    factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def override_session() -> Iterator[Session]:
        database_session = factory()
        try:
            yield database_session
        finally:
            database_session.close()

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: Settings(phase5_local_api_enabled=True),
    )
    app.dependency_overrides[get_session] = override_session
    client = TestClient(app)
    payload = {
        "account": student_account().model_dump(by_alias=True),
        "registration": student_registration().model_dump(by_alias=True),
        "existingRegistration": "conflict",
    }

    first = client.post(
        "/phase5/registrations",
        headers={"Idempotency-Key": "api-registration-0001"},
        json=payload,
    )
    second = client.post(
        "/phase5/registrations",
        headers={"Idempotency-Key": "api-registration-0001"},
        json=payload,
    )
    health = client.get("/phase5/health/db")
    missing_idempotency_key = client.post(
        "/phase5/registrations",
        json=payload,
    )

    app.dependency_overrides.clear()

    assert first.status_code == 200
    assert first.json()["status"] == "approved"
    assert first.json()["persisted"] is True
    assert first.json()["replayed"] is False
    assert second.status_code == 200
    assert second.json()["applicationId"] == first.json()["applicationId"]
    assert second.json()["replayed"] is True
    assert health.status_code == 200
    assert health.json() == {
        "status": "ok",
        "phase": "5-local",
        "dialect": "sqlite",
        "externalSideEffectsEnabled": False,
    }
    assert missing_idempotency_key.status_code == 422


def test_phase5_api_refuses_external_side_effects(
    engine,
    monkeypatch,
) -> None:
    factory = sessionmaker(bind=engine)

    def override_session() -> Iterator[Session]:
        database_session = factory()
        try:
            yield database_session
        finally:
            database_session.close()

    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: Settings(
            phase5_local_api_enabled=True,
            external_side_effects_enabled=True,
        ),
    )
    app.dependency_overrides[get_session] = override_session
    client = TestClient(app)
    response = client.post(
        "/phase5/registrations",
        headers={"Idempotency-Key": "side-effects-disabled-0001"},
        json={
            "account": student_account().model_dump(by_alias=True),
            "registration": student_registration().model_dump(
                by_alias=True
            ),
            "existingRegistration": "none",
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 503
