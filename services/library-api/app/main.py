import re
import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.auth import (
    GoogleAuthConfigurationError,
    GoogleCredentialError,
    GoogleTokenVerifier,
    VerifiedGoogleIdentity,
)
from app.config import Settings, get_settings
from app.db.models import LibraryAdmin, LibraryApplication
from app.admin_service import (
    AdminAccessError,
    AdminConflictError,
    AdminNotFoundError,
    AdminPrincipal,
    application_item,
    deactivate_member,
    decide_application,
    list_applications,
    list_members,
    list_audit,
    require_admin,
    retry_operation,
    revoke_member,
)
from app.admin_export_service import (
    AdminExportBusyError,
    AdminExportConflictError,
    AdminExportError,
    AdminExportLimitError,
    generate_admin_member_export,
)
from app.db.session import get_session
from app.drive_client import GoogleDrivePermissionClient
from app.drive_operations import (
    DriveOperationConflictError,
    drive_access_status_for_application,
    enqueue_drive_revoke,
    process_due_drive_operations,
    requeue_drive_operation,
)
from app.eligibility import evaluate_eligibility
from app.notification_client import GasNotificationWebhookClient
from app.notification_outbox import process_due_notification_outbox
from app.observability import emit_event
from app.registration_service import (
    PersistenceConflictError,
    persist_registration,
)
from app.public_registration_rpc import (
    PublicRegistrationRpcBoundaryError,
    fetch_public_registration_status_v1,
)
from app.rate_limit import (
    admin_export_rate_limiter,
    status_rate_limiter,
    submit_global_rate_limiter,
    submit_rate_limiter,
)
from app.schemas import (
    EligibilityRequest,
    EligibilityResponse,
    Phase5DatabaseHealth,
    Phase5RegistrationResponse,
    Phase6AdminAuthorizationResponse,
    Phase6AuthenticationResponse,
    Phase6RegistrationRequest,
    Phase6RegistrationResponse,
    Phase7OperationResult,
    Phase7ProcessRequest,
    Phase7ProcessResponse,
    Phase7RegistrationStatusResponse,
    Phase7RevokeResponse,
    Phase7RetryResponse,
    AdminApplicationItem,
    AdminApplicationDetail,
    AdminApplicationListResponse,
    AdminApplicationSearchRequest,
    AdminMemberListResponse,
    AdminMemberSearchRequest,
    AdminAuditListResponse,
    AdminDecisionRequest,
    AdminExportRequest,
    AdminMutationResponse,
    AdminRetryRequest,
    AdminRevokeRequest,
    AdminSessionResponse,
)


@asynccontextmanager
async def composite_lifespan(_app: FastAPI):
    get_settings().validate_for_service("local-composite")
    yield


app = FastAPI(
    title="Future Strategy Library API",
    version="0.10.0-phase10a-local",
    description=(
        "Registration, Drive operation, administrator, migration, and safe "
        "roster-export foundation. External side effects remain fail-closed."
    ),
    lifespan=composite_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_allowed_origin_list),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "X-Request-ID",
    ],
    expose_headers=[
        "X-Request-ID",
        "Content-Disposition",
        "X-Export-Run-ID",
        "X-Export-Row-Count",
        "X-Content-SHA256",
        "X-Export-Delete-After",
    ],
    max_age=600,
)

REQUEST_ID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    supplied_request_id = request.headers.get("X-Request-ID", "")
    request_id = (
        supplied_request_id
        if REQUEST_ID_PATTERN.fullmatch(supplied_request_id)
        else str(uuid4())
    )
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


def get_google_token_verifier() -> GoogleTokenVerifier:
    return GoogleTokenVerifier(get_settings())


def get_admin_google_token_verifier() -> GoogleTokenVerifier:
    return GoogleTokenVerifier(get_settings(), audience_kind="admin")


def require_phase7_worker_boundary(
    worker_token: Annotated[
        str | None,
        Header(alias="X-Phase7-Worker-Token"),
    ] = None,
) -> Settings:
    settings = get_settings()
    if not settings.phase7_worker_api_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    cloud_run_mode = (
        settings.app_env.lower() == "production"
        and settings.service_surface == "worker"
        and settings.worker_auth_mode == "cloud_run_oidc"
    )
    expected_key = settings.phase7_worker_secret
    if not cloud_run_mode and len(expected_key) < 32:
        raise HTTPException(
            status_code=503,
            detail="phase7_worker_not_configured",
        )
    if not cloud_run_mode and (
        worker_token is None
        or not secrets.compare_digest(worker_token, expected_key)
    ):
        raise HTTPException(status_code=403, detail="worker_access_denied")
    try:
        settings.validate_phase7_worker_boundary()
    except ValueError as error:
        raise HTTPException(
            status_code=503,
            detail="phase7_drive_safely_stopped",
        ) from error
    return settings


def get_phase7_drive_client(
    settings: Annotated[
        Settings,
        Depends(require_phase7_worker_boundary),
    ],
) -> GoogleDrivePermissionClient:
    try:
        return GoogleDrivePermissionClient(settings)
    except ValueError as error:
        raise HTTPException(
            status_code=503,
            detail="phase7_drive_not_configured",
        ) from error


def _verify_google_bearer(
    authorization: str | None,
    verifier: GoogleTokenVerifier,
    *,
    configuration_error_detail: str,
) -> VerifiedGoogleIdentity:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="google_authentication_required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    credential = authorization.removeprefix("Bearer ").strip()
    try:
        return verifier.verify(credential)
    except GoogleAuthConfigurationError as error:
        raise HTTPException(
            status_code=503,
            detail=configuration_error_detail,
        ) from error
    except GoogleCredentialError as error:
        headers = (
            {"WWW-Authenticate": "Bearer"}
            if error.status_code == 401
            else None
        )
        raise HTTPException(
            status_code=error.status_code,
            detail=error.code,
            headers=headers,
        ) from error


def require_verified_google_identity(
    authorization: Annotated[str | None, Header()] = None,
    verifier: Annotated[
        GoogleTokenVerifier,
        Depends(get_google_token_verifier),
    ] = None,
) -> VerifiedGoogleIdentity:
    settings = get_settings()
    if not settings.phase6_auth_api_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    return _verify_google_bearer(
        authorization,
        verifier,
        configuration_error_detail="phase6_auth_not_configured",
    )


def require_verified_admin_google_identity(
    authorization: Annotated[str | None, Header()] = None,
    verifier: Annotated[
        GoogleTokenVerifier,
        Depends(get_admin_google_token_verifier),
    ] = None,
) -> VerifiedGoogleIdentity:
    settings = get_settings()
    if not settings.phase8_admin_api_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    return _verify_google_bearer(
        authorization,
        verifier,
        configuration_error_detail="admin_auth_not_configured",
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "phase": "7-foundation"}


@app.post("/phase3/evaluate", response_model=EligibilityResponse)
def evaluate(request: EligibilityRequest) -> EligibilityResponse:
    return evaluate_eligibility(
        request.account,
        request.registration,
        request.existing_registration,
    )


@app.get("/phase5/health/db", response_model=Phase5DatabaseHealth)
def phase5_database_health(
    session: Annotated[Session, Depends(get_session)],
) -> Phase5DatabaseHealth:
    settings = get_settings()
    if not settings.phase5_local_api_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    session.execute(text("SELECT 1"))
    return Phase5DatabaseHealth(
        status="ok",
        phase="5-local",
        dialect=session.get_bind().dialect.name,
        external_side_effects_enabled=settings.external_side_effects_enabled,
    )


@app.post(
    "/phase5/registrations",
    response_model=Phase5RegistrationResponse,
)
def phase5_register(
    request: EligibilityRequest,
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(
            alias="Idempotency-Key",
            min_length=8,
            max_length=128,
        ),
    ],
) -> Phase5RegistrationResponse:
    settings = get_settings()
    if not settings.phase5_local_api_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    if settings.external_side_effects_enabled:
        raise HTTPException(
            status_code=503,
            detail="Phase 5 refuses to run with external side effects enabled.",
        )

    try:
        result = persist_registration(
            session,
            request.account,
            request.registration,
            idempotency_key,
            settings=settings,
        )
    except PersistenceConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return Phase5RegistrationResponse(
        **result.eligibility.model_dump(),
        persisted=result.persisted,
        replayed=result.replayed,
        application_id=result.application_id,
        member_id=result.member_id,
    )


@app.post(
    "/phase6/auth/verify",
    response_model=Phase6AuthenticationResponse,
)
def phase6_verify_authentication(
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_google_identity),
    ],
) -> Phase6AuthenticationResponse:
    return Phase6AuthenticationResponse(
        email=identity.email,
        hosted_domain=identity.hosted_domain,
    )


@app.post(
    "/phase6/registrations",
    response_model=Phase6RegistrationResponse,
)
def phase6_register(
    request: Phase6RegistrationRequest,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(
            alias="Idempotency-Key",
            min_length=8,
            max_length=128,
        ),
    ],
) -> Phase6RegistrationResponse:
    settings = get_settings()
    if settings.api_read_only_mode:
        raise HTTPException(status_code=503, detail="api_read_only")
    if settings.rate_limits_enabled:
        subject_allowed, subject_retry_after = submit_rate_limiter.allow(
            identity.subject_hash,
            limit=settings.submit_rate_limit_per_hour,
            window_seconds=3600,
        )
        if not subject_allowed:
            raise HTTPException(
                status_code=429,
                detail="rate_limit_exceeded",
                headers={"Retry-After": str(subject_retry_after)},
            )
        global_allowed, global_retry_after = submit_global_rate_limiter.allow(
            "global",
            limit=settings.submit_global_rate_limit_per_minute,
            window_seconds=60,
        )
        if not global_allowed:
            raise HTTPException(
                status_code=429,
                detail="rate_limit_exceeded",
                headers={"Retry-After": str(global_retry_after)},
            )
    if (
        settings.external_side_effects_enabled
        and not settings.phase7_drive_api_enabled
    ):
        raise HTTPException(
            status_code=503,
            detail="phase7_drive_boundary_not_configured",
        )

    try:
        result = persist_registration(
            session,
            identity.to_account_facts(settings),
            request.registration,
            idempotency_key,
            settings=settings,
            identity=identity,
            source="phase6_authenticated",
        )
    except PersistenceConflictError as error:
        raise HTTPException(
            status_code=409,
            detail="registration_conflict",
        ) from error
    except PublicRegistrationRpcBoundaryError as error:
        raise HTTPException(
            status_code=503,
            detail="registration_service_unavailable",
        ) from error

    return Phase6RegistrationResponse(
        **result.eligibility.model_dump(),
        persisted=result.persisted,
        replayed=result.replayed,
        application_id=result.application_id,
        identity_linked=result.identity_linked,
        drive_access_status=result.drive_access_status,
        drive_notification_status=result.drive_notification_status,
    )


@app.get(
    "/phase6/admin/authorization",
    response_model=Phase6AdminAuthorizationResponse,
)
def phase6_admin_authorization(
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> Phase6AdminAuthorizationResponse:
    admin = session.scalar(
        select(LibraryAdmin).where(
            LibraryAdmin.google_sub == identity.google_sub,
            LibraryAdmin.active.is_(True),
        )
    )
    if admin is None:
        raise HTTPException(status_code=403, detail="admin_access_denied")
    return Phase6AdminAuthorizationResponse(role=admin.role)


def _admin_api_enabled() -> Settings:
    settings = get_settings()
    if not settings.phase8_admin_api_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    return settings


def _admin_mutations_enabled() -> None:
    settings = get_settings()
    if (
        not settings.phase8_admin_api_enabled
        or not settings.admin_mutations_enabled
    ):
        # This route-level dependency runs before bearer-token and database
        # dependencies. Disabled administrative writes therefore remain
        # indistinguishable from routes that do not exist.
        raise HTTPException(status_code=404, detail="Not found")


def _phase10a_export_route_enabled() -> None:
    settings = get_settings()
    if (
        not settings.phase8_admin_api_enabled
        or not settings.phase10a_export_api_enabled
    ):
        # This decorator-level dependency executes before bearer-token and DB
        # dependencies, so a disabled export surface remains indistinguishable
        # from an absent route.
        raise HTTPException(status_code=404, detail="Not found")


def _admin_http_error(error: RuntimeError) -> HTTPException:
    if isinstance(error, AdminAccessError):
        return HTTPException(status_code=403, detail=str(error))
    if isinstance(error, AdminNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=409, detail=str(error))


def _emit_admin_read_success(
    settings: Settings,
    http_request: Request,
    principal: AdminPrincipal,
    *,
    action: str,
    result_count: int | None = None,
    target_uuid: UUID | None = None,
) -> None:
    """Emit a successful administrative read without identity or roster PII."""

    if not settings.structured_logging_enabled:
        return
    fields: dict[str, str | int] = {
        "actor_admin_id": str(principal.admin_id),
        "actor_role": principal.role,
        "action": action,
        "request_id": http_request.state.request_id,
    }
    if result_count is not None:
        fields["result_count"] = result_count
    if target_uuid is not None:
        fields["target_uuid"] = str(target_uuid)
    emit_event("admin_read_succeeded", **fields)


@app.get("/admin/v1/session", response_model=AdminSessionResponse)
def admin_session(
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> AdminSessionResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity)
    except AdminAccessError as error:
        raise _admin_http_error(error) from error
    response = AdminSessionResponse(role=principal.role)
    _emit_admin_read_success(
        settings,
        http_request,
        principal,
        action="admin.session.read",
    )
    return response


@app.get(
    "/admin/v1/applications",
    response_model=AdminApplicationListResponse,
)
def admin_applications(
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    decision: Annotated[str | None, Query(max_length=32)] = None,
    drive_status: Annotated[
        str | None,
        Query(alias="driveStatus", max_length=32),
    ] = None,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
) -> AdminApplicationListResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity)
        items, has_more = list_applications(
            session,
            settings,
            decision=decision,
            drive_status=drive_status,
            query=None,
            offset=offset,
            limit=limit,
        )
    except (AdminAccessError, AdminConflictError) as error:
        raise _admin_http_error(error) from error
    response = AdminApplicationListResponse(
        items=items,
        offset=offset,
        limit=limit,
        has_more=has_more,
    )
    _emit_admin_read_success(
        settings,
        http_request,
        principal,
        action="admin.applications.list",
        result_count=len(items),
    )
    return response


@app.post(
    "/admin/v1/applications/search",
    response_model=AdminApplicationListResponse,
)
def admin_search_applications(
    body: AdminApplicationSearchRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> AdminApplicationListResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity)
        items, has_more = list_applications(
            session,
            settings,
            decision=body.decision,
            drive_status=body.drive_status,
            query=body.q,
            offset=body.offset,
            limit=body.limit,
        )
    except (AdminAccessError, AdminConflictError) as error:
        raise _admin_http_error(error) from error
    response = AdminApplicationListResponse(
        items=items,
        offset=body.offset,
        limit=body.limit,
        has_more=has_more,
    )
    _emit_admin_read_success(
        settings,
        http_request,
        principal,
        action="admin.applications.search",
        result_count=len(items),
    )
    return response


@app.post(
    "/admin/v1/members/search",
    response_model=AdminMemberListResponse,
)
def admin_search_members(
    body: AdminMemberSearchRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> AdminMemberListResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity)
        items, has_more = list_members(
            session,
            query=body.q,
            grade=body.grade,
            member_status=body.member_status,
            sort_by=body.sort_by,
            sort_direction=body.sort_direction,
            offset=body.offset,
            limit=body.limit,
        )
    except (AdminAccessError, AdminConflictError) as error:
        raise _admin_http_error(error) from error
    response = AdminMemberListResponse(
        items=items,
        offset=body.offset,
        limit=body.limit,
        has_more=has_more,
    )
    _emit_admin_read_success(
        settings,
        http_request,
        principal,
        action="admin.members.search",
        result_count=len(items),
    )
    return response


@app.get(
    "/admin/v1/applications/{application_id}",
    response_model=AdminApplicationDetail,
)
def admin_application_detail(
    application_id: UUID,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> AdminApplicationDetail:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity)
        application = session.get(LibraryApplication, application_id)
        if application is None:
            raise AdminNotFoundError("application_not_found")
        item = application_item(session, application, settings)
        response = AdminApplicationDetail(
            **item.model_dump(),
            question=application.question,
            decision_reason=application.decision_reason,
        )
    except (AdminAccessError, AdminNotFoundError) as error:
        raise _admin_http_error(error) from error
    _emit_admin_read_success(
        settings,
        http_request,
        principal,
        action="admin.application.detail",
        target_uuid=application_id,
    )
    return response


@app.post(
    "/admin/v1/applications/{application_id}/decision",
    response_model=AdminMutationResponse,
    dependencies=[Depends(_admin_mutations_enabled)],
)
def admin_decide_application(
    application_id: UUID,
    body: AdminDecisionRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> AdminMutationResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity, minimum_role="operator")
        return decide_application(
            session,
            settings,
            principal,
            application_id,
            body,
            idempotency_key=idempotency_key,
            request_id=http_request.state.request_id,
        )
    except (AdminAccessError, AdminConflictError, AdminNotFoundError) as error:
        raise _admin_http_error(error) from error


@app.post(
    "/admin/v1/operations/{operation_id}/retry",
    response_model=AdminMutationResponse,
    dependencies=[Depends(_admin_mutations_enabled)],
)
def admin_retry_operation(
    operation_id: UUID,
    body: AdminRetryRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> AdminMutationResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity, minimum_role="operator")
        return retry_operation(
            session,
            settings,
            principal,
            operation_id,
            body,
            idempotency_key=idempotency_key,
            request_id=http_request.state.request_id,
        )
    except (AdminAccessError, AdminConflictError, AdminNotFoundError) as error:
        raise _admin_http_error(error) from error


@app.post(
    "/admin/v1/members/{member_id}/revoke",
    response_model=AdminMutationResponse,
    dependencies=[Depends(_admin_mutations_enabled)],
)
def admin_revoke_member(
    member_id: UUID,
    body: AdminRevokeRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> AdminMutationResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity, minimum_role="admin")
        return revoke_member(
            session,
            settings,
            principal,
            member_id,
            body,
            idempotency_key=idempotency_key,
            request_id=http_request.state.request_id,
        )
    except (AdminAccessError, AdminConflictError, AdminNotFoundError) as error:
        raise _admin_http_error(error) from error


@app.post(
    "/admin/v1/members/{member_id}/deactivate",
    response_model=AdminMutationResponse,
    dependencies=[Depends(_admin_mutations_enabled)],
)
def admin_deactivate_member(
    member_id: UUID,
    body: AdminRevokeRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> AdminMutationResponse:
    _admin_api_enabled()
    try:
        principal = require_admin(session, identity, minimum_role="admin")
        return deactivate_member(
            session,
            principal,
            member_id,
            body,
            idempotency_key=idempotency_key,
            request_id=http_request.state.request_id,
        )
    except (AdminAccessError, AdminConflictError, AdminNotFoundError) as error:
        raise _admin_http_error(error) from error


@app.get(
    "/admin/v1/audit-events",
    response_model=AdminAuditListResponse,
)
def admin_audit_events(
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
) -> AdminAuditListResponse:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity)
        items, has_more = list_audit(session, offset=offset, limit=limit)
    except AdminAccessError as error:
        raise _admin_http_error(error) from error
    response = AdminAuditListResponse(
        items=items,
        offset=offset,
        limit=limit,
        has_more=has_more,
    )
    _emit_admin_read_success(
        settings,
        http_request,
        principal,
        action="admin.audit.list",
        result_count=len(items),
    )
    return response


@app.post(
    "/admin/v1/exports",
    response_class=Response,
    dependencies=[Depends(_phase10a_export_route_enabled)],
)
def admin_member_export(
    body: AdminExportRequest,
    http_request: Request,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_admin_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> Response:
    settings = _admin_api_enabled()
    try:
        principal = require_admin(session, identity, minimum_role="admin")
    except AdminAccessError as error:
        raise _admin_http_error(error) from error

    if settings.rate_limits_enabled:
        allowed, retry_after = admin_export_rate_limiter.allow(
            str(principal.admin_id),
            limit=settings.phase10a_export_rate_limit_per_hour,
            window_seconds=3600,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="export_rate_limit_exceeded",
                headers={"Retry-After": str(retry_after)},
            )

    try:
        result = generate_admin_member_export(
            session,
            settings,
            principal,
            body,
            idempotency_key=idempotency_key,
            request_id=http_request.state.request_id,
        )
    except AdminExportConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except AdminExportBusyError as error:
        raise HTTPException(
            status_code=429,
            detail=str(error),
            headers={"Retry-After": "5"},
        ) from error
    except AdminExportLimitError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except AdminExportError as error:
        status = 503 if str(error) == "api_read_only" else 422
        raise HTTPException(status_code=status, detail=str(error)) from error

    artifact = result.artifact
    return Response(
        content=artifact.content,
        headers={
            "Content-Type": artifact.content_type,
            "Content-Disposition": artifact.content_disposition,
            "Cache-Control": "private, no-store",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Content-Type-Options": "nosniff",
            "X-Export-Run-ID": str(result.export_run_id),
            "X-Export-Row-Count": str(artifact.manifest.row_count),
            "X-Content-SHA256": artifact.manifest.sha256,
            "X-Export-Delete-After": (
                result.recommended_delete_at.isoformat()
            ),
        },
    )


@app.get(
    "/phase7/registrations/{application_id}/status",
    response_model=Phase7RegistrationStatusResponse,
)
def phase7_registration_status(
    application_id: UUID,
    identity: Annotated[
        VerifiedGoogleIdentity,
        Depends(require_verified_google_identity),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> Phase7RegistrationStatusResponse:
    settings = get_settings()
    if settings.rate_limits_enabled:
        allowed, retry_after = status_rate_limiter.allow(
            identity.subject_hash,
            limit=settings.status_rate_limit_per_five_minutes,
            window_seconds=300,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="rate_limit_exceeded",
                headers={"Retry-After": str(retry_after)},
            )
    if (
        settings.app_env.lower() == "production"
        and settings.service_surface == "public"
    ):
        if settings.public_database_access_mode != "rpc_v1":
            raise HTTPException(
                status_code=503,
                detail="registration_service_unavailable",
            )
        try:
            rpc_status = fetch_public_registration_status_v1(
                session,
                application_id=application_id,
                authentication_subject_hash=identity.subject_hash,
                settings=settings,
            )
        except PublicRegistrationRpcBoundaryError as error:
            raise HTTPException(
                status_code=503,
                detail="registration_service_unavailable",
            ) from error
        if rpc_status is None:
            raise HTTPException(
                status_code=404,
                detail="registration_not_found",
            )
        return Phase7RegistrationStatusResponse(
            application_id=rpc_status.application_id,
            drive_access_status=rpc_status.drive_access_status,
            drive_notification_status=rpc_status.drive_notification_status,
        )

    application = session.scalar(
        select(LibraryApplication).where(
            LibraryApplication.id == application_id,
            LibraryApplication.authentication_subject_hash
            == identity.subject_hash,
        )
    )
    if application is None:
        raise HTTPException(status_code=404, detail="registration_not_found")
    access_status, notification_status = drive_access_status_for_application(
        session,
        application,
        settings.drive_resource_id,
    )
    return Phase7RegistrationStatusResponse(
        application_id=application.id,
        drive_access_status=access_status,
        drive_notification_status=notification_status,
    )


@app.post(
    "/phase7/internal/operations/process",
    response_model=Phase7ProcessResponse,
)
def phase7_process_operations(
    request: Phase7ProcessRequest,
    settings: Annotated[
        Settings,
        Depends(require_phase7_worker_boundary),
    ],
    drive_client: Annotated[
        GoogleDrivePermissionClient,
        Depends(get_phase7_drive_client),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> Phase7ProcessResponse:
    results = process_due_drive_operations(
        session,
        drive_client,
        settings,
        limit=request.limit,
    )
    if settings.phase7_notification_delivery_enabled:
        # Drive commits before notification dispatch. A webhook failure can
        # only update its isolated outbox row and never roll back access.
        notification_client = GasNotificationWebhookClient(settings)
        process_due_notification_outbox(
            session,
            notification_client,
            settings,
            limit=request.limit,
        )
    response_results = [
        Phase7OperationResult(
            operation_id=result.operation_id,
            status=result.status,
            error_code=result.error_code,
        )
        for result in results
    ]
    return Phase7ProcessResponse(
        processed=len(response_results),
        succeeded=sum(result.status == "succeeded" for result in results),
        failed=sum(result.status == "failed" for result in results),
        dead=sum(result.status == "dead" for result in results),
        results=response_results,
    )


@app.post(
    "/phase7/internal/members/{member_id}/revoke",
    response_model=Phase7RevokeResponse,
)
def phase7_enqueue_revoke(
    member_id: UUID,
    settings: Annotated[
        Settings,
        Depends(require_phase7_worker_boundary),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> Phase7RevokeResponse:
    try:
        operation = enqueue_drive_revoke(session, member_id, settings)
    except DriveOperationConflictError as error:
        raise HTTPException(
            status_code=409,
            detail="drive_grant_not_found",
        ) from error
    return Phase7RevokeResponse(
        operation_id=operation.id,
        status=operation.status,
    )


@app.post(
    "/phase7/internal/operations/{operation_id}/retry",
    response_model=Phase7RetryResponse,
)
def phase7_retry_operation(
    operation_id: UUID,
    settings: Annotated[
        Settings,
        Depends(require_phase7_worker_boundary),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> Phase7RetryResponse:
    try:
        operation = requeue_drive_operation(
            session,
            operation_id,
            settings,
        )
    except DriveOperationConflictError as error:
        detail = str(error)
        status_code = 404 if detail == "drive_operation_not_found" else 409
        raise HTTPException(status_code=status_code, detail=detail) from error
    return Phase7RetryResponse(
        operation_id=operation.id,
        status="pending",
    )
