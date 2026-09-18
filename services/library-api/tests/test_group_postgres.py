"""Opt-in local synthetic PostgreSQL gate. Never connects to Neon/production."""
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from hashlib import sha256
import os
from pathlib import Path
import subprocess
from uuid import uuid4

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, select, text, func
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import LibraryMember, LibraryAccessGroup, LibraryGroupMembership, LibraryOperation
from app.group_operations import reserve_membership
from app.registration_service import persist_registration
from app.drive_operations import process_due_drive_operations
from tests.test_group_access import CONFIG, FakeDriveClient, FakeGroups, provision
from tests.test_public_registration_rpc import SETTINGS as RPC_SETTINGS, IDENTITY, RPC_TOKEN
from tests.factories import student_registration

URL = os.environ.get("FSL_GROUP_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="Local synthetic PostgreSQL is opt-in")
ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def pg():
    url = make_url(URL)
    if url.host not in {"127.0.0.1", "localhost"} or url.database != "fsl_groups_synthetic":
        pytest.fail("Refusing non-local or non-synthetic database")
    engine = create_engine(URL)
    with engine.connect() as conn:
        if conn.scalar(text("SELECT to_regclass('public.library_members')")):
            pytest.fail("Synthetic database must be empty; refusing overwrite")
    env = dict(os.environ, PGHOST=url.host, PGPORT=str(url.port or 5432),
               PGUSER=url.username, PGDATABASE=url.database)
    for filename in ("bootstrap_database_roles.sql",):
        result = subprocess.run(["psql", "-X", "-f", str(ROOT / "scripts" / filename)],
                                env=env, capture_output=True, timeout=30)
        assert result.returncode == 0, "local role bootstrap failed"
    previous = os.environ.get("DATABASE_URL_UNPOOLED")
    os.environ["DATABASE_URL_UNPOOLED"] = URL
    get_settings.cache_clear()
    child_engines = []
    try:
        config = Config(str(ROOT / "alembic.ini"))
        command.upgrade(config, "head")
        command.downgrade(config, "0b1c2d3e4f5a")
        # Real historical member before upgrade: default must remain legacy.
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO library_members(id,full_name,academic_role,faculty_code,"
                "member_status,record_version) VALUES (:id,'Synthetic legacy','faculty_staff','pharmacy','active',1)"),
                {"id": uuid4()})
        command.upgrade(config, "head")
        result = subprocess.run(["psql", "-X", "-f", str(ROOT / "scripts" / "grant_database_privileges.sql")],
                                env=env, capture_output=True, timeout=30)
        assert result.returncode == 0, "local role grants failed"
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO fsl_private.public_registration_rpc_keys"
                              "(key_version,token_sha256) VALUES ('v1',:digest)"),
                         {"digest": sha256(RPC_TOKEN.encode()).digest()})
            for login, role in (("fsl_group_api_test", "fsl_api_runtime"), ("fsl_group_worker_test", "fsl_worker_runtime")):
                conn.exec_driver_sql(f"CREATE ROLE {login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS")
                conn.exec_driver_sql(f"GRANT {role} TO {login}")
        result = subprocess.run(["psql", "-X", "-f", str(ROOT / "scripts" / "audit_database_roles.sql")],
                                env=env, capture_output=True, timeout=30)
        assert result.returncode == 0, "local database privilege audit failed"
        child_engines = [create_engine(url.set(username="fsl_group_api_test")),
                         create_engine(url.set(username="fsl_group_worker_test"))]
        yield engine, *child_engines
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL_UNPOOLED", None)
        else:
            os.environ["DATABASE_URL_UNPOOLED"] = previous
        get_settings.cache_clear()
        for child in child_engines:
            child.dispose()
        engine.dispose()


def test_pg_rpc_idempotency_worker_and_acl(pg):
    owner, api, worker = pg
    settings = RPC_SETTINGS.model_copy(update={"group_access_enabled": True, "group_access_cutover_at": datetime(2026, 1, 1, tzinfo=UTC)})
    def submit():
        with Session(api) as session:
            return persist_registration(session, IDENTITY.to_account_facts(settings),
                student_registration(), "group-postgres-idempotency-001", settings=settings,
                identity=IDENTITY, source="phase6_authenticated")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: submit(), range(2)))
    assert results[0].application_id == results[1].application_id
    assert sum(result.replayed for result in results) == 1
    with Session(owner) as session:
        member = session.scalar(select(LibraryMember).where(LibraryMember.normalized_email == IDENTITY.email))
        assert member.access_strategy == "group_membership"
        legacy = session.scalar(select(LibraryMember).where(LibraryMember.normalized_email.is_(None)))
        assert legacy.access_strategy == "legacy_individual"
        assert session.scalar(select(func.count()).select_from(LibraryOperation)) == 1
        drive, groups = FakeDriveClient(), FakeGroups()
        provision(session, drive)
    worker_settings = CONFIG.model_copy(update={
        "service_surface": "worker",
        "drive_operation_attestation_key": settings.drive_operation_attestation_key,
    })
    with Session(worker, expire_on_commit=False, autoflush=False) as session:
        result = process_due_drive_operations(session, drive, worker_settings, limit=1, groups_client=groups)
        assert result[0].status == "succeeded", result[0].error_code
    with api.begin() as conn:
        for table in ("library_members", "library_access_groups", "library_group_memberships", "library_resource_group_grants"):
            assert conn.scalar(text("SELECT has_table_privilege(current_user,:table,'SELECT')"), {"table": table}) is False
    with Session(worker) as session:
        with pytest.raises(DBAPIError):
            session.execute(text("UPDATE library_access_groups SET capacity=800"))
        session.rollback()
        with pytest.raises(DBAPIError):
            session.execute(text("UPDATE library_members SET access_strategy='legacy_individual'"))
        session.rollback()
    with Session(owner) as session:
        with pytest.raises(DBAPIError, match="immutable"):
            session.execute(text("UPDATE library_members SET access_strategy='group_membership' WHERE normalized_email IS NULL"))
        session.rollback()
    assert drive.create_calls == drive.delete_calls == 0


def test_pg_two_hundred_separate_connections_reserve_without_overflow(pg):
    owner, _, worker = pg
    drive = FakeDriveClient()
    with Session(owner) as session:
        first = LibraryAccessGroup(google_group_name="groups/concurrencyA",
            group_email="concurrency-a@groups.example.test", cohort_key="ug-2024",
            shard=1, capacity=800, state="ready", reserved_count=799)
        second = LibraryAccessGroup(google_group_name="groups/concurrencyB",
            group_email="concurrency-b@groups.example.test", cohort_key="ug-2024",
            shard=2, capacity=800, state="ready", reserved_count=0)
        session.add_all([first, second])
        session.flush()
        first_id, second_id = first.id, second.id
        members = []
        for i in range(200):
            member = LibraryMember(id=uuid4(), full_name="Synthetic", academic_role="undergraduate",
                faculty_code="pharmacy", member_status="active", access_strategy="group_membership",
                normalized_student_number=f"PP24{i:03d}")
            members.append(member.id)
            session.add(member)
        session.commit()
    def reserve(member_id):
        # Real independent transactions, not a shared SQLite connection.
        with Session(worker) as session:
            session.execute(text("SELECT fsl_worker_api.lock_member_v1(:id)"), {"id": member_id})
            member = session.get(LibraryMember, member_id)
            membership = reserve_membership(session, member, ("groups/concurrencyA", "groups/concurrencyB"))
            session.commit()
            return membership.group_id
    with ThreadPoolExecutor(max_workers=2) as pool:
        allocated = list(pool.map(reserve, members))
    with Session(owner) as session:
        assert session.get(LibraryAccessGroup, first_id).reserved_count == 800
        assert session.get(LibraryAccessGroup, second_id).reserved_count == 199
        assert allocated.count(first_id) == 1
