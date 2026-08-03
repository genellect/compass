from app.config import Settings
from app.db import session as session_module


def test_neon_pooler_omits_unsupported_startup_options(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_create_engine(database_url: str, **options):
        captured["database_url"] = database_url
        captured["options"] = options
        return object()

    monkeypatch.setattr(session_module, "create_engine", fake_create_engine)
    session_module.create_database_engine(
        Settings(
            database_url=(
                "postgresql://user:password@"
                "ep-example-pooler.ap-southeast-1.aws.neon.tech/database"
            )
        )
    )

    options = captured["options"]
    assert isinstance(options, dict)
    assert "connect_args" not in options


def test_neon_direct_connection_keeps_statement_timeout(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_create_engine(database_url: str, **options):
        captured["database_url"] = database_url
        captured["options"] = options
        return object()

    monkeypatch.setattr(session_module, "create_engine", fake_create_engine)
    session_module.create_database_engine(
        Settings(
            database_url=(
                "postgresql://user:password@"
                "ep-example.ap-southeast-1.aws.neon.tech/database"
            ),
            db_statement_timeout_seconds=12,
        )
    )

    options = captured["options"]
    assert isinstance(options, dict)
    assert options["connect_args"] == {
        "options": "-c statement_timeout=12000"
    }
