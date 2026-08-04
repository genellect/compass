"""Ephemeral-PostgreSQL verification for the Phase 10A API and Drive races.

The script is deliberately limited to the isolated Compose PostgreSQL server.
It creates a temporary database, migrates it to the current head, uses only
synthetic records and an in-memory Drive double, and drops the database in a
``finally`` block.  Google, Drive, Neon, Cloud Run, and email are never called.
"""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Event
from time import sleep
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

import app.main as main_module
from app.admin_service import AdminPrincipal, deactivate_member, revoke_member
from app.auth import VerifiedGoogleIdentity
from app.config import Settings
from app.db.models import (
    LibraryAccessGrant,
    LibraryAdmin,
    LibraryAdminAudit,
    LibraryApplication,
    LibraryExportRun,
    LibraryIdentity,
    LibraryMember,
    LibraryOperation,
)
from app.drive_attestation import (
    DRIVE_TARGET_ALIAS,
    build_drive_operation_attestation_facts,
    issue_drive_operation_attestation,
)
from app.db.session import (
    create_database_engine,
    get_session,
    normalize_database_url,
)
from app.drive_client import DrivePermission
from app.drive_operations import process_due_drive_operations
from app.main import app, get_admin_google_token_verifier
from app.schemas import AdminRevokeRequest
from scripts.local_database_roles import (
    bootstrap_and_bind_local_database,
    grant_and_audit_local_database,
)


EXPECTED_ALEMBIC_HEAD = "e9f0a1b2c3d4"
PRIMARY_DATABASE = "compass_library_dev"
PRIMARY_USERNAME = "compass_library_dev"
PRIMARY_HOST = "db"
DRIVE_RESOURCE_ID = "synthetic-phase10a-race-resource"
SYNTHETIC_ORIGIN = "http://127.0.0.1:3000"


def _guard() -> str:
    if os.environ.get("FSL_DATA_CLASSIFICATION") != "synthetic-only":
        raise RuntimeError("FSL_DATA_CLASSIFICATION=synthetic-only is required")
    if os.environ.get("FSL_PHASE9_10A_LOCAL_EVIDENCE") != "confirmed":
        raise RuntimeError("FSL_PHASE9_10A_LOCAL_EVIDENCE=confirmed is required")
    for name, expected in {
        "EXTERNAL_SIDE_EFFECTS_ENABLED": "false",
        "PHASE7_DRIVE_API_ENABLED": "false",
        "PHASE7_DRIVE_KILL_SWITCH": "true",
    }.items():
        if os.environ.get(name, "").lower() != expected:
            raise RuntimeError(f"{name} must be {expected}")

    database_url = os.environ.get("DATABASE_URL", "").strip()
    parsed = make_url(normalize_database_url(database_url))
    if (
        parsed.get_backend_name() != "postgresql"
        or parsed.host != PRIMARY_HOST
        or parsed.database != PRIMARY_DATABASE
        or parsed.username != PRIMARY_USERNAME
    ):
        raise RuntimeError("isolated Compose PostgreSQL URL is required")
    return database_url


def _render_url(url) -> str:
    return url.render_as_string(hide_password=False)


def _run_migrations(database_url: str) -> None:
    environment = os.environ.copy()
    environment.update(
        {
            "DATABASE_URL": database_url,
            "DATABASE_URL_UNPOOLED": database_url,
            "EXTERNAL_SIDE_EFFECTS_ENABLED": "false",
            "PHASE7_DRIVE_API_ENABLED": "false",
            "PHASE7_DRIVE_KILL_SWITCH": "true",
            "GOOGLE_DRIVE_OAUTH_CLIENT_ID": "",
            "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET": "",
            "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN": "",
        }
    )
    service_root = Path(__file__).resolve().parents[1]
    completed = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=service_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        timeout=90,
    )
    if completed.returncode != 0:
        raise RuntimeError("temporary PostgreSQL migration failed")


@contextmanager
def _ephemeral_database(primary_url: str) -> Iterator[str]:
    primary = make_url(normalize_database_url(primary_url))
    database_name = f"fsl_phase10a_evidence_{uuid4().hex}"
    temporary = primary.set(database=database_name)
    administrative_engine = create_engine(
        primary,
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )
    created = False
    try:
        with administrative_engine.connect() as connection:
            connection.exec_driver_sql(f'CREATE DATABASE "{database_name}"')
        created = True
        temporary_url = _render_url(temporary)
        bootstrap_and_bind_local_database(temporary_url)
        _run_migrations(temporary_url)
        grant_and_audit_local_database(temporary_url)
        yield temporary_url
    finally:
        if created:
            with administrative_engine.connect() as connection:
                connection.execute(
                    text(
                        "SELECT pg_terminate_backend(pid) "
                        "FROM pg_stat_activity "
                        "WHERE datname = :database_name "
                        "AND pid <> pg_backend_pid()"
                    ),
                    {"database_name": database_name},
                )
                connection.exec_driver_sql(f'DROP DATABASE "{database_name}"')
        administrative_engine.dispose()


def _settings(database_url: str, **updates: Any) -> Settings:
    values: dict[str, Any] = {
        "app_env": "docker-phase10a-api-race-synthetic",
        "service_surface": "local-composite",
        "database_url": database_url,
        "database_url_unpooled": database_url,
        "db_pool_size": 6,
        "db_max_overflow": 0,
        "pii_logging_enabled": False,
        "external_side_effects_enabled": False,
        "phase6_auth_api_enabled": True,
        "google_oauth_client_ids": "synthetic-phase10a-client",
        "google_admin_oauth_client_ids": "synthetic-phase10a-admin-client",
        "allowed_google_hosted_domains": "st.kitasato-u.ac.jp",
        "cors_allowed_origins": SYNTHETIC_ORIGIN,
        "rate_limits_enabled": True,
        "drive_resource_id": DRIVE_RESOURCE_ID,
        "phase7_drive_api_enabled": False,
        "phase7_drive_kill_switch": True,
        "phase8_admin_api_enabled": True,
        "phase10a_export_api_enabled": True,
        "phase10a_export_max_rows": 5_000,
        "phase10a_export_rate_limit_per_hour": 12,
        "worker_batch_size": 10,
        "worker_time_budget_seconds": 30,
        "phase7_retry_base_seconds": 1,
    }
    values.update(updates)
    return Settings(**values)


def _identity(google_sub: str) -> VerifiedGoogleIdentity:
    return VerifiedGoogleIdentity(
        google_sub=google_sub,
        email=f"{google_sub}@st.kitasato-u.ac.jp",
        email_verified=True,
        hosted_domain="st.kitasato-u.ac.jp",
        issuer="https://accounts.google.com",
        audience="synthetic-phase10a-admin-client",
    )


class SyntheticVerifier:
    def __init__(self, identities: dict[str, VerifiedGoogleIdentity]) -> None:
        self.identities = identities

    def verify(self, credential: str) -> VerifiedGoogleIdentity:
        identity = self.identities.get(credential)
        if identity is None:
            raise AssertionError("unexpected synthetic bearer token")
        return identity


def _export_payload(export_format: str = "csv") -> dict[str, Any]:
    return {
        "format": export_format,
        "memberStatus": "active",
        "academicRole": None,
        "purposeCode": "periodic_roster_review",
        "confirmed": True,
    }


def _authorization(token: str, idempotency_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Idempotency-Key": idempotency_key,
        "Origin": SYNTHETIC_ORIGIN,
    }


def _seed_api_records(factory: sessionmaker[Session]) -> dict[str, UUID]:
    identities = {
        "admin": "phase10a-pg-admin",
        "rate_admin": "phase10a-pg-rate-admin",
        "viewer": "phase10a-pg-viewer",
    }
    with factory() as session:
        admins: dict[str, UUID] = {}
        for label, google_sub in identities.items():
            record = LibraryAdmin(
                google_sub=google_sub,
                role="viewer" if label == "viewer" else "admin",
                active=True,
            )
            session.add(record)
            session.flush()
            admins[label] = record.id
        member = LibraryMember(
            normalized_email="phase10a-api-member@example.invalid",
            normalized_student_number="PP90001",
            full_name="=SYNTHETIC FORMULA-LIKE NAME",
            academic_role="undergraduate",
            faculty_code="pharmacy",
            grade="1",
            member_status="active",
        )
        session.add(member)
        session.flush()
        session.add(
            LibraryAccessGrant(
                member_id=member.id,
                resource_id=DRIVE_TARGET_ALIAS,
                target_alias=DRIVE_TARGET_ALIAS,
                role="reader",
                status="already_granted",
                managed_by_system=False,
                notification_status="not_applicable",
            )
        )
        session.commit()
        return admins


def _verify_export_api(
    engine: Engine,
    database_url: str,
) -> dict[str, Any]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    admin_ids = _seed_api_records(factory)
    identities = {
        "synthetic-admin-token": _identity("phase10a-pg-admin"),
        "synthetic-rate-admin-token": _identity("phase10a-pg-rate-admin"),
        "synthetic-viewer-token": _identity("phase10a-pg-viewer"),
    }
    enabled_settings = _settings(database_url)
    disabled_settings = enabled_settings.model_copy(
        update={"phase10a_export_api_enabled": False}
    )
    original_get_settings = main_module.get_settings
    dependency_calls = {"session": 0, "verifier": 0}

    def forbidden_session() -> Iterator[Session]:
        dependency_calls["session"] += 1
        raise AssertionError("disabled export touched the database dependency")
        yield  # pragma: no cover

    def forbidden_verifier() -> SyntheticVerifier:
        dependency_calls["verifier"] += 1
        raise AssertionError("disabled export touched the auth dependency")

    def override_session() -> Iterator[Session]:
        with factory() as session:
            yield session

    try:
        main_module.get_settings = lambda: disabled_settings
        app.dependency_overrides[get_session] = forbidden_session
        app.dependency_overrides[
            get_admin_google_token_verifier
        ] = forbidden_verifier
        disabled = TestClient(app).post(
            "/admin/v1/exports",
            json=_export_payload(),
        )
        assert disabled.status_code == 404
        assert disabled.json() == {"detail": "Not found"}
        assert dependency_calls == {"session": 0, "verifier": 0}

        main_module.get_settings = lambda: enabled_settings
        app.dependency_overrides[get_session] = override_session
        app.dependency_overrides[get_admin_google_token_verifier] = lambda: (
            SyntheticVerifier(identities)
        )
        client = TestClient(app)

        missing_auth = client.post(
            "/admin/v1/exports",
            headers={"Idempotency-Key": "phase10a-missing-auth"},
            json=_export_payload(),
        )
        assert missing_auth.status_code == 401

        missing_idempotency = client.post(
            "/admin/v1/exports",
            headers={"Authorization": "Bearer synthetic-admin-token"},
            json=_export_payload(),
        )
        assert missing_idempotency.status_code == 422

        viewer = client.post(
            "/admin/v1/exports",
            headers=_authorization(
                "synthetic-viewer-token",
                "phase10a-viewer-forbidden",
            ),
            json=_export_payload(),
        )
        assert viewer.status_code == 403
        assert viewer.json() == {"detail": "admin_access_denied"}

        preflight = client.options(
            "/admin/v1/exports",
            headers={
                "Origin": SYNTHETIC_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": (
                    "authorization,content-type,idempotency-key,x-request-id"
                ),
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == SYNTHETIC_ORIGIN

        request_id = str(uuid4())
        idempotency_key = "phase10a-postgres-idempotency"
        response = client.post(
            "/admin/v1/exports",
            headers={
                **_authorization("synthetic-admin-token", idempotency_key),
                "X-Request-ID": request_id,
            },
            json=_export_payload(),
        )
        assert response.status_code == 200
        assert response.headers["x-request-id"] == request_id
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["pragma"] == "no-cache"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["access-control-allow-origin"] == SYNTHETIC_ORIGIN
        assert response.headers["x-export-row-count"] == "1"
        assert response.headers["x-content-sha256"] == hashlib.sha256(
            response.content
        ).hexdigest()
        assert response.headers["x-export-run-id"]
        assert response.headers["x-export-delete-after"]
        assert response.headers["content-disposition"].startswith(
            'attachment; filename="library-members-'
        )
        exposed = response.headers["access-control-expose-headers"].lower()
        for required in (
            "content-disposition",
            "x-export-run-id",
            "x-export-row-count",
            "x-content-sha256",
            "x-export-delete-after",
        ):
            assert required in exposed

        replay = client.post(
            "/admin/v1/exports",
            headers=_authorization("synthetic-admin-token", idempotency_key),
            json=_export_payload(),
        )
        assert replay.status_code == 409
        assert replay.json() == {"detail": "export_already_generated"}

        mismatch = client.post(
            "/admin/v1/exports",
            headers=_authorization("synthetic-admin-token", idempotency_key),
            json=_export_payload("xlsx"),
        )
        assert mismatch.status_code == 409
        assert mismatch.json() == {"detail": "idempotency_payload_mismatch"}

        rate_settings = enabled_settings.model_copy(
            update={"phase10a_export_rate_limit_per_hour": 2}
        )
        main_module.get_settings = lambda: rate_settings
        for index in range(2):
            allowed = client.post(
                "/admin/v1/exports",
                headers=_authorization(
                    "synthetic-rate-admin-token",
                    f"phase10a-rate-allowed-{index}",
                ),
                json=_export_payload(),
            )
            assert allowed.status_code == 200
        limited = client.post(
            "/admin/v1/exports",
            headers=_authorization(
                "synthetic-rate-admin-token",
                "phase10a-rate-rejected",
            ),
            json=_export_payload(),
        )
        assert limited.status_code == 429
        assert limited.json() == {"detail": "export_rate_limit_exceeded"}
        assert int(limited.headers["retry-after"]) >= 1

        with factory() as session:
            assert session.scalar(select(func.count()).select_from(LibraryExportRun)) == 3
            assert session.scalar(select(func.count()).select_from(LibraryAdminAudit)) == 3
            assert session.scalar(
                select(func.count())
                .select_from(LibraryExportRun)
                .where(LibraryExportRun.admin_id == admin_ids["viewer"])
            ) == 0
    finally:
        main_module.get_settings = original_get_settings
        app.dependency_overrides.clear()

    return {
        "feature_off_before_auth_and_db": "pass",
        "rbac": "pass",
        "required_headers_and_no_store": "pass",
        "cors": "pass",
        "idempotency": "pass",
        "rate_limit": "pass",
    }


def _seed_pending_grant(
    factory: sessionmaker[Session],
    settings: Settings,
    *,
    suffix: str,
) -> tuple[UUID, UUID, UUID]:
    with factory() as session:
        admin = LibraryAdmin(
            google_sub=f"phase10a-race-admin-{suffix}",
            role="admin",
            active=True,
        )
        member = LibraryMember(
            normalized_email=f"phase10a-race-{suffix}@st.kitasato-u.ac.jp",
            normalized_student_number=f"PP9{int(suffix[-4:], 16) % 10000:04d}",
            full_name=f"SYNTHETIC RACE {suffix}",
            academic_role="undergraduate",
            faculty_code="pharmacy",
            grade="1",
            member_status="active",
        )
        session.add_all([admin, member])
        session.flush()
        now = datetime.now(UTC)
        application = LibraryApplication(
            member_id=member.id,
            idempotency_key=hashlib.sha256(
                f"phase10a-race-application-{suffix}".encode("utf-8")
            ).hexdigest(),
            normalized_email=member.normalized_email,
            normalized_student_number=member.normalized_student_number,
            full_name=member.full_name,
            academic_role=member.academic_role,
            faculty_code=member.faculty_code,
            grade=member.grade,
            question=None,
            eligibility_status="approved",
            reason_codes=["eligible"],
            terms_version="phase10a-synthetic",
            terms_accepted_at=now,
            privacy_version="phase10a-synthetic",
            privacy_accepted_at=now,
            source="phase10a_synthetic",
            admin_decision="not_required",
        )
        identity = LibraryIdentity(
            member_id=member.id,
            google_sub=f"phase10a-race-sub-{suffix}",
            verified_email=member.normalized_email,
            hosted_domain="st.kitasato-u.ac.jp",
            email_verified=True,
            issuer="https://accounts.google.com",
            audience="phase10a-synthetic-registration-client",
            last_verified_at=now,
        )
        session.add_all([application, identity])
        session.flush()
        grant = LibraryAccessGrant(
            member_id=member.id,
            resource_id=DRIVE_RESOURCE_ID,
            target_alias=DRIVE_TARGET_ALIAS,
            role="reader",
            status="pending",
            managed_by_system=False,
            notification_status="pending",
        )
        operation = LibraryOperation(
            member_id=member.id,
            application_id=application.id,
            operation_key=f"drive_grant:{member.id}:{DRIVE_TARGET_ALIAS}",
            operation_type="drive_grant",
            resource_id=None,
            target_alias=DRIVE_TARGET_ALIAS,
            status="pending",
            max_attempts=3,
        )
        session.add_all([grant, operation])
        session.flush()
        issue_drive_operation_attestation(
            operation,
            facts=build_drive_operation_attestation_facts(
                session,
                operation,
                member,
                grant,
                application,
            ),
            key=settings.drive_operation_attestation_key,
        )
        session.commit()
        return admin.id, member.id, operation.id


@dataclass
class DeterministicDriveClient:
    pause_create: bool = False
    create_entered: Event = field(default_factory=Event)
    release_create: Event = field(default_factory=Event)
    permissions: dict[str, DrivePermission] = field(default_factory=dict)
    find_calls: int = 0
    create_calls: int = 0
    delete_calls: int = 0

    def find_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission | None:
        assert resource_id == DRIVE_RESOURCE_ID
        self.find_calls += 1
        return self.permissions.get(email)

    def create_reader_permission(
        self,
        resource_id: str,
        email: str,
    ) -> DrivePermission:
        assert resource_id == DRIVE_RESOURCE_ID
        self.create_calls += 1
        if self.pause_create:
            self.create_entered.set()
            if not self.release_create.wait(timeout=10):
                raise AssertionError("timed out waiting to release fake Drive create")
        permission = DrivePermission(f"synthetic-permission-{uuid4()}", "reader")
        self.permissions[email] = permission
        return permission

    def delete_permission(
        self,
        resource_id: str,
        permission_id: str,
    ) -> None:
        assert resource_id == DRIVE_RESOURCE_ID
        self.delete_calls += 1
        matching = [
            email
            for email, permission in self.permissions.items()
            if permission.permission_id == permission_id
        ]
        assert len(matching) == 1
        del self.permissions[matching[0]]


def _future_result(future: Future[Any], *, label: str) -> Any:
    try:
        return future.result(timeout=15)
    except TimeoutError as error:
        raise AssertionError(f"timed out waiting for {label}") from error


def _verify_deactivate_wins_race(
    engine: Engine,
    settings: Settings,
) -> None:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    admin_id, member_id, operation_id = _seed_pending_grant(
        factory,
        settings,
        suffix=uuid4().hex[:8],
    )
    admin_before_cancel = Event()
    release_admin = Event()
    worker_member_lock_query = Event()
    fake_drive = DeterministicDriveClient()

    def intercept(
        connection,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        role = connection.info.get("phase10a_race_role")
        normalized = " ".join(statement.lower().split())
        if (
            role == "deactivate-admin"
            and "from library_operations" in normalized
            and "library_operations.operation_type" in normalized
            and not admin_before_cancel.is_set()
        ):
            admin_before_cancel.set()
            if not release_admin.wait(timeout=10):
                raise AssertionError("timed out pausing admin cancellation query")
        if (
            role == "deactivate-worker"
            and "from library_members" in normalized
            and "for update" in normalized
        ):
            worker_member_lock_query.set()

    event.listen(engine, "before_cursor_execute", intercept)

    def run_admin():
        with factory() as session:
            session.connection().info["phase10a_race_role"] = "deactivate-admin"
            member = session.get(LibraryMember, member_id)
            assert member is not None
            return deactivate_member(
                session,
                AdminPrincipal(admin_id=admin_id, role="admin"),
                member_id,
                AdminRevokeRequest(
                    reason="Synthetic concurrent deactivate race evidence.",
                    expected_record_version=member.record_version,
                    confirmed_member_id=member_id,
                ),
                idempotency_key=f"deactivate-{uuid4()}",
                request_id=str(uuid4()),
            )

    def run_worker():
        with factory() as session:
            session.connection().info["phase10a_race_role"] = "deactivate-worker"
            return process_due_drive_operations(
                session,
                fake_drive,
                settings,
                limit=1,
                worker_id=f"deactivate-worker-{uuid4().hex}",
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            admin_future = executor.submit(run_admin)
            assert admin_before_cancel.wait(timeout=10)
            worker_future = executor.submit(run_worker)
            assert worker_member_lock_query.wait(timeout=10)
            assert not worker_future.done()
            release_admin.set()
            admin_result = _future_result(admin_future, label="admin deactivate")
            worker_results = _future_result(worker_future, label="blocked grant worker")
    finally:
        release_admin.set()
        event.remove(engine, "before_cursor_execute", intercept)

    assert admin_result.status == "inactive"
    assert len(worker_results) == 1
    assert worker_results[0].status == "dead"
    assert worker_results[0].error_code == "member_inactive"
    assert fake_drive.find_calls == 0
    assert fake_drive.create_calls == 0
    assert fake_drive.permissions == {}
    with factory() as session:
        member = session.get(LibraryMember, member_id)
        operation = session.get(LibraryOperation, operation_id)
        grant = session.scalar(
            select(LibraryAccessGrant).where(
                LibraryAccessGrant.member_id == member_id,
                LibraryAccessGrant.resource_id == DRIVE_RESOURCE_ID,
            )
        )
        assert member is not None and member.member_status == "inactive"
        assert operation is not None and operation.status == "dead"
        assert operation.error_code == "member_inactive"
        assert grant is not None and grant.status == "failed"


def _verify_grant_then_revoke_race(
    engine: Engine,
    settings: Settings,
) -> None:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    admin_id, member_id, grant_operation_id = _seed_pending_grant(
        factory,
        settings,
        suffix=uuid4().hex[:8],
    )
    fake_drive = DeterministicDriveClient(pause_create=True)
    revoke_member_lock_query = Event()

    def intercept(
        connection,
        _cursor,
        statement: str,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        normalized = " ".join(statement.lower().split())
        if (
            connection.info.get("phase10a_race_role") == "revoke-admin"
            and "from library_members" in normalized
            and "for update" in normalized
        ):
            revoke_member_lock_query.set()

    event.listen(engine, "before_cursor_execute", intercept)

    def run_worker():
        with factory() as session:
            session.connection().info["phase10a_race_role"] = "grant-worker"
            return process_due_drive_operations(
                session,
                fake_drive,
                settings,
                limit=1,
                worker_id=f"grant-worker-{uuid4().hex}",
            )

    def run_revoke():
        with factory() as session:
            session.connection().info["phase10a_race_role"] = "revoke-admin"
            member = session.get(LibraryMember, member_id)
            assert member is not None
            return revoke_member(
                session,
                settings,
                AdminPrincipal(admin_id=admin_id, role="admin"),
                member_id,
                AdminRevokeRequest(
                    reason="Synthetic concurrent revoke race evidence.",
                    expected_record_version=member.record_version,
                    confirmed_member_id=member_id,
                ),
                idempotency_key=f"revoke-{uuid4()}",
                request_id=str(uuid4()),
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            worker_future = executor.submit(run_worker)
            assert fake_drive.create_entered.wait(timeout=10)
            revoke_future = executor.submit(run_revoke)
            assert revoke_member_lock_query.wait(timeout=10)
            sleep(0.1)
            assert not revoke_future.done()
            fake_drive.release_create.set()
            worker_results = _future_result(worker_future, label="grant worker")
            revoke_result = _future_result(revoke_future, label="admin revoke")
    finally:
        fake_drive.release_create.set()
        event.remove(engine, "before_cursor_execute", intercept)

    assert len(worker_results) == 1 and worker_results[0].status == "succeeded"
    assert revoke_result.status == "pending"
    with factory() as session:
        revoke_results = process_due_drive_operations(
            session,
            fake_drive,
            settings,
            limit=1,
            worker_id=f"revoke-worker-{uuid4().hex}",
        )
    assert len(revoke_results) == 1
    assert revoke_results[0].status == "succeeded"
    assert fake_drive.find_calls == 1
    assert fake_drive.create_calls == 1
    assert fake_drive.delete_calls == 1
    assert fake_drive.permissions == {}

    with factory() as session:
        member = session.get(LibraryMember, member_id)
        grant = session.scalar(
            select(LibraryAccessGrant).where(
                LibraryAccessGrant.member_id == member_id,
                LibraryAccessGrant.resource_id == DRIVE_RESOURCE_ID,
            )
        )
        grant_operation = session.get(LibraryOperation, grant_operation_id)
        revoke_operations = list(
            session.scalars(
                select(LibraryOperation).where(
                    LibraryOperation.member_id == member_id,
                    LibraryOperation.operation_type == "drive_revoke",
                )
            )
        )
        assert member is not None and member.member_status == "inactive"
        assert grant is not None and grant.status == "revoked"
        assert grant.managed_by_system is True
        assert grant_operation is not None and grant_operation.status == "succeeded"
        assert len(revoke_operations) == 1
        assert revoke_operations[0].status == "succeeded"


def _verify_races(engine: Engine, database_url: str) -> dict[str, str]:
    settings = _settings(database_url, rate_limits_enabled=False)
    _verify_deactivate_wins_race(engine, settings)
    _verify_grant_then_revoke_race(engine, settings)
    return {
        "deactivate_before_grant": "pass",
        "grant_then_revoke": "pass",
        "fake_drive_only": "pass",
    }


def main() -> None:
    primary_url = _guard()
    ephemeral_dropped = False
    with _ephemeral_database(primary_url) as database_url:
        settings = _settings(database_url)
        engine = create_database_engine(settings)
        try:
            with engine.connect() as connection:
                assert connection.scalar(
                    text("SELECT version_num FROM alembic_version")
                ) == EXPECTED_ALEMBIC_HEAD
            api_result = _verify_export_api(engine, database_url)
            race_result = _verify_races(engine, database_url)
        finally:
            engine.dispose()
    ephemeral_dropped = True

    print(
        json.dumps(
            {
                "status": "pass",
                "classification": "synthetic-only",
                "schema_head": EXPECTED_ALEMBIC_HEAD,
                "admin_export_api": api_result,
                "drive_races": race_result,
                "ephemeral_database_dropped": ephemeral_dropped,
                "external_side_effects": False,
                "remote_services_contacted": False,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
