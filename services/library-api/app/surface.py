from __future__ import annotations

import re
import secrets
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text

from app.config import get_settings
from app.db.runtime_boundary import verify_runtime_database_boundary
from app.db.session import get_session_factory
from app.main import app as composite_app
from app.observability import emit_event
from app.rate_limit import admin_preauth_rate_limiter, preauth_rate_limiter


REQUEST_ID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)
EXPECTED_ALEMBIC_HEAD = "0b1c2d3e4f5a"


class MaxBodyMiddleware:
    def __init__(self, app, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        if scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        messages = []
        received = 0
        while True:
            message = await receive()
            messages.append(message)
            if message.get("type") != "http.request":
                break
            received += len(message.get("body", b""))
            if received > self.max_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "request_body_too_large"},
                    headers={"Cache-Control": "no-store"},
                )
                await response(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        async def replay_receive():
            if messages:
                return messages.pop(0)
            return {"type": "http.disconnect"}

        await self.app(scope, replay_receive, send)


def _allowed_path(surface: str, path: str) -> bool:
    if surface == "public":
        return (
            path in {"/phase6/auth/verify", "/phase6/registrations"}
            or path.startswith("/phase7/registrations/")
        )
    if surface == "admin":
        return (
            path == "/phase6/admin/authorization"
            or path.startswith("/admin/v1/")
        )
    if surface == "worker":
        return path == "/phase7/internal/operations/process"
    return False


def create_surface_app(surface: str) -> FastAPI:
    settings = get_settings()
    settings.validate_for_service(surface)
    production = settings.app_env.lower() == "production"
    api = FastAPI(
        title=f"Future Strategy Library {surface.title()} API",
        version="0.8.0",
        docs_url=None if production else "/docs",
        redoc_url=None,
        openapi_url=None if production else "/openapi.json",
    )
    api.add_middleware(
        MaxBodyMiddleware,
        max_bytes=settings.max_request_body_bytes,
    )

    for route in composite_app.router.routes:
        path = getattr(route, "path", "")
        admin_standby = surface == "admin" and not settings.phase8_admin_api_enabled
        if _allowed_path(surface, path) and not admin_standby:
            api.router.routes.append(route)

    @api.exception_handler(RequestValidationError)
    async def sanitized_validation_error(
        _request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        errors = [
            {
                "type": item.get("type", "validation_error"),
                "loc": item.get("loc", ()),
                "msg": item.get("msg", "Invalid request"),
            }
            for item in error.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

    @api.exception_handler(Exception)
    async def sanitized_internal_error(
        request: Request,
        _error: Exception,
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid4()))
        return JSONResponse(
            status_code=500,
            content={"detail": "internal_server_error"},
            headers={
                "X-Request-ID": request_id,
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @api.middleware("http")
    async def production_boundary(request: Request, call_next):
        supplied = request.headers.get("X-Request-ID", "")
        request_id = supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else str(uuid4())
        request.state.request_id = request_id
        started = perf_counter()

        def finalize(response: Response) -> Response:
            response.headers["X-Request-ID"] = request_id
            if request.url.path == "/admin/v1/exports":
                # Export responses contain the roster itself. Preserve the
                # endpoint's private cache directive when the production
                # surface middleware applies its common response headers.
                response.headers["Cache-Control"] = "private, no-store"
                response.headers["Pragma"] = "no-cache"
            else:
                response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            if settings.structured_logging_enabled:
                route = request.scope.get("route")
                route_template = getattr(route, "path", "unmatched")
                emit_event(
                    "http_request",
                    service_surface=surface,
                    request_id=request_id,
                    route=route_template,
                    method=request.method,
                    status=response.status_code,
                    duration_ms=round((perf_counter() - started) * 1000, 2),
                )
            return response

        admin_application_path = (
            request.url.path == "/phase6/admin/authorization"
            or request.url.path.startswith("/admin/v1/")
        )
        production_admin_protected = (
            production
            and surface == "admin"
            and request.url.path != "/health/live"
        )
        if production_admin_protected:
            edge_secret_values = request.headers.getlist(
                "X-Library-Admin-Edge-Secret"
            )
            supplied_edge_secret = (
                edge_secret_values[0] if len(edge_secret_values) == 1 else ""
            )
            expected_edge_secret = settings.library_admin_edge_shared_secret
            valid_edge_origin = (
                1 <= len(supplied_edge_secret) <= 512
                and secrets.compare_digest(
                    supplied_edge_secret,
                    expected_edge_secret,
                )
            )
            if not valid_edge_origin:
                # This is deliberately before routing, body parsing, the
                # limiter, readiness/database work, and Google verification.
                # Unknown and known paths have the same concealed response.
                return finalize(JSONResponse(
                    status_code=404,
                    content={"detail": "Not found"},
                    headers={"Cache-Control": "no-store"},
                ))

        admin_rate_limit_required = production_admin_protected or (
            not production
            and surface == "admin"
            and settings.phase8_admin_api_enabled
            and request.method != "OPTIONS"
            and admin_application_path
        )
        if admin_rate_limit_required and (
            production or settings.rate_limits_enabled
        ):
            # Production applies this to every non-live path, including
            # readiness and unknown paths. It executes only after the private
            # edge capability and before route resolution or database access.
            allowed, retry_after = admin_preauth_rate_limiter.allow(
                "admin-preauth-global",
                limit=settings.admin_preauth_rate_limit_per_minute,
                window_seconds=60,
            )
            if not allowed:
                return finalize(JSONResponse(
                    status_code=429,
                    content={"detail": "rate_limit_exceeded"},
                    headers={
                        "X-Request-ID": request_id,
                        "Retry-After": str(retry_after),
                        "Cache-Control": "no-store",
                    },
                ))

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                too_large = int(content_length) > settings.max_request_body_bytes
            except ValueError:
                too_large = True
            if too_large:
                return finalize(JSONResponse(
                    status_code=413,
                    content={"detail": "request_body_too_large"},
                ))
        if (
            request.method in {"POST", "PUT", "PATCH"}
            and content_length not in {None, "0"}
            and request.headers.get("content-type", "").split(";", 1)[0].lower()
            != "application/json"
        ):
            return finalize(JSONResponse(
                status_code=415,
                content={"detail": "application_json_required"},
            ))
        if (
            settings.rate_limits_enabled
            and surface == "public"
            and request.url.path == "/phase6/auth/verify"
        ):
            allowed, retry_after = preauth_rate_limiter.allow(
                "phase6-auth-verify-global",
                limit=settings.preauth_rate_limit_per_minute,
                window_seconds=60,
            )
            if not allowed:
                return finalize(JSONResponse(
                    status_code=429,
                    content={"detail": "rate_limit_exceeded"},
                    headers={
                        "X-Request-ID": request_id,
                        "Retry-After": str(retry_after),
                        "Cache-Control": "no-store",
                    },
                ))
        response = await call_next(request)
        return finalize(response)

    @api.get("/health/live", include_in_schema=False)
    def live() -> dict[str, str]:
        return {"status": "ok"}

    @api.get("/health/ready", include_in_schema=False)
    def ready() -> JSONResponse:
        try:
            with get_session_factory()() as session:
                session.execute(text("SELECT 1"))
                revision = session.scalar(
                    text("SELECT version_num FROM alembic_version")
                )
                if revision != EXPECTED_ALEMBIC_HEAD:
                    raise RuntimeError("schema_not_ready")
                if production and surface in {"public", "admin", "worker"}:
                    verify_runtime_database_boundary(
                        session,
                        surface=surface,
                        expected_role=settings.runtime_database_role,
                        rpc_key_version=(
                            settings.public_registration_rpc_key_version
                            if surface == "public"
                            else None
                        ),
                        rpc_token=(
                            settings.public_registration_rpc_token
                            if surface == "public"
                            else None
                        ),
                    )
        except Exception:
            return JSONResponse(status_code=503, content={"status": "not_ready"})
        return JSONResponse(content={"status": "ready"})

    # Add CORS last so it also wraps body/content-type/rate-limit failures.
    if surface == "public":
        api.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_allowed_origin_list),
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
                "Retry-After",
                "Content-Disposition",
                "X-Export-Run-ID",
                "X-Export-Row-Count",
                "X-Content-SHA256",
                "X-Export-Delete-After",
            ],
            max_age=600,
        )

    return api
