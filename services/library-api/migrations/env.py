from logging.config import fileConfig

from alembic import context

from app.config import get_settings
from app.db.base import Base
from app.db.models import (  # noqa: F401
    LibraryAccessGrant,
    LibraryAdmin,
    LibraryAdminAudit,
    LibraryApplication,
    LibraryExportRun,
    LibraryIdentity,
    LibraryImportBatch,
    LibraryImportRow,
    LibraryMember,
    LibraryOperation,
)
from app.db.session import create_database_engine, normalize_database_url


config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata
MIGRATION_CAPABILITY_ROLE = "fsl_migration"


def _activate_migration_capability_role(connection) -> None:
    """Make the NOLOGIN capability role the owner of Alembic-created objects.

    PostgreSQL grants alone are insufficient here: without ``SET ROLE``, a
    member login creates tables as itself. Requiring the role switch makes a
    missing or incorrect production binding fail before Alembic touches the
    schema. SQLite remains available for local unit tests.
    """

    if connection.dialect.name != "postgresql":
        return

    connection.exec_driver_sql(f"SET ROLE {MIGRATION_CAPABILITY_ROLE}")
    active_role = connection.exec_driver_sql("SELECT current_user").scalar_one()
    if active_role != MIGRATION_CAPABILITY_ROLE:
        raise RuntimeError(
            "The migration connection did not activate the fsl_migration role."
        )

    # SET ROLE is session-scoped. End SQLAlchemy's implicit transaction before
    # Alembic opens the migration transaction; the role remains active.
    connection.commit()


def run_migrations_offline() -> None:
    settings = get_settings()
    context.configure(
        url=normalize_database_url(settings.migration_database_url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=True,
    )

    if context.get_context().dialect.name == "postgresql":
        context.execute(f"SET ROLE {MIGRATION_CAPABILITY_ROLE}")

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_database_engine(get_settings(), migration=True)
    try:
        with engine.connect() as connection:
            _activate_migration_capability_role(connection)
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                render_as_batch=connection.dialect.name == "sqlite",
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
