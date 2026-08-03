from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings


def normalize_database_url(value: str) -> str:
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


def is_transaction_pooler_url(value: str) -> bool:
    database_url = make_url(normalize_database_url(value))
    return (
        database_url.get_backend_name() == "postgresql"
        and "-pooler." in (database_url.host or "")
    )


def create_database_engine(settings: Settings, *, migration: bool = False) -> Engine:
    source_url = (
        settings.migration_database_url if migration else settings.database_url
    )
    database_url = normalize_database_url(source_url)
    common_options: dict[str, object] = {
        "pool_pre_ping": True,
    }

    if database_url.startswith("sqlite"):
        common_options["connect_args"] = {"check_same_thread": False}
    else:
        common_options.update(
            {
                "pool_size": settings.db_pool_size,
                "max_overflow": settings.db_max_overflow,
                "pool_timeout": settings.db_pool_timeout_seconds,
                "pool_recycle": settings.db_pool_recycle_seconds,
            }
        )
        # Neon PgBouncer rejects statement_timeout as a startup option.
        # Direct connections keep the timeout; pooled connections omit it.
        if not is_transaction_pooler_url(database_url):
            common_options["connect_args"] = {
                "options": (
                    f"-c statement_timeout="
                    f"{settings.db_statement_timeout_seconds * 1000}"
                )
            }

    return create_engine(database_url, **common_options)


@lru_cache
def get_engine() -> Engine:
    return create_database_engine(get_settings())


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        expire_on_commit=False,
    )


def get_session() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
