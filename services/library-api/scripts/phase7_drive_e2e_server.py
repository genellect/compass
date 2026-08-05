"""One-time real Drive E2E using owner OAuth, Picker, and the Phase 7 worker.

Secrets, OAuth codes, raw tokens, full email addresses, and Drive IDs remain in
process memory. Only sanitized fingerprints and HTTP-independent outcomes are
written as evidence. The OAuth grant is revoked during cleanup.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import secrets
import threading
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db.base import Base
from app.db.models import (
    LibraryAccessGrant,
    LibraryApplication,
    LibraryIdentity,
    LibraryMember,
    LibraryOperation,
)
from app.drive_attestation import (
    DRIVE_TARGET_ALIAS,
    build_drive_operation_attestation_facts,
    issue_drive_operation_attestation,
)
from app.drive_client import DRIVE_SCOPE, GoogleDrivePermissionClient
from app.drive_operations import enqueue_drive_revoke, process_due_drive_operations


HOST = "127.0.0.1"
PORT = 8767
REDIRECT_URI = f"http://localhost:{PORT}/oauth2/callback"
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
SCOPES = ("openid", "email", DRIVE_SCOPE)
VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
MAX_REQUEST_BYTES = 20_000
MAX_TEST_FOLDER_AGE = timedelta(hours=24)
ALLOWED_HOST_HEADERS = {
    f"localhost:{PORT}",
    f"127.0.0.1:{PORT}",
}
DRIVE_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{10,200}")
CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "style-src 'unsafe-inline'",
        (
            "script-src 'unsafe-inline' https://apis.google.com "
            "https://*.googleapis.com https://*.gstatic.com"
        ),
        (
            "connect-src 'self' https://*.googleapis.com "
            "https://accounts.google.com"
        ),
        "frame-src https://*.google.com https://*.googleusercontent.com",
        "img-src 'self' data: https://*.googleusercontent.com",
    )
)


def _valid_local_host(value: str) -> bool:
    return value.strip().lower() in ALLOWED_HOST_HEADERS


def _transition(flow: dict[str, Any], expected: str, target: str) -> bool:
    if flow.get("stage") != expected:
        return False
    flow["stage"] = target
    return True


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _email_domain(value: str) -> str:
    normalized = value.strip().lower()
    return normalized.rsplit("@", 1)[1] if "@" in normalized else ""


def _post_form(url: str, values: dict[str, str]) -> requests.Response:
    try:
        return requests.post(url, data=values, timeout=20)
    except requests.RequestException as error:
        raise RuntimeError("Google OAuth endpoint unavailable.") from error


def _exchange_code(
    code: str,
    *,
    client_id: str,
    client_secret: str,
) -> dict[str, Any]:
    response = _post_form(
        TOKEN_ENDPOINT,
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )
    if response.status_code != HTTPStatus.OK:
        raise RuntimeError("Google OAuth code exchange failed.")
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("Google OAuth returned an invalid response.")
    return payload


def _verify_id_token(id_token: str, client_id: str) -> dict[str, str]:
    try:
        response = requests.get(
            TOKENINFO_ENDPOINT,
            params={"id_token": id_token},
            timeout=20,
        )
        response.raise_for_status()
        claims = response.json()
    except (requests.RequestException, ValueError) as error:
        raise RuntimeError("Google ID token verification failed.") from error
    if not isinstance(claims, dict):
        raise RuntimeError("Google ID token verification failed.")
    try:
        expires_at = int(str(claims["exp"]))
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("Google ID token expiry is invalid.") from error
    normalized_email = str(claims.get("email") or "").strip().lower()
    if not all(
        (
            claims.get("aud") == client_id,
            claims.get("iss") in VALID_ISSUERS,
            expires_at > int(datetime.now(UTC).timestamp()),
            str(claims.get("email_verified", "")).lower() == "true",
            bool(str(claims.get("sub") or "")),
            bool(_email_domain(normalized_email)),
        )
    ):
        raise RuntimeError("Google ID token claims were rejected.")
    return {
        "subject_fingerprint": _fingerprint(str(claims["sub"])),
        "email_domain": _email_domain(normalized_email),
        "normalized_email": normalized_email,
    }


def _revoke(token: str) -> bool:
    if not token:
        return False
    response = _post_form(REVOKE_ENDPOINT, {"token": token})
    return response.status_code == HTTPStatus.OK


def _refresh_token_is_rejected(
    refresh_token: str,
    *,
    client_id: str,
    client_secret: str,
) -> bool:
    response = _post_form(
        TOKEN_ENDPOINT,
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    try:
        payload = response.json()
    except ValueError:
        return False
    return (
        response.status_code == HTTPStatus.BAD_REQUEST
        and isinstance(payload, dict)
        and payload.get("error") == "invalid_grant"
    )


def _authorization_url(client_id: str, state: str) -> str:
    return f"{AUTHORIZATION_ENDPOINT}?{urlencode({
        'client_id': client_id,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent select_account',
        'include_granted_scopes': 'false',
        'state': state,
    })}"


def _drive_get(
    access_token: str,
    path: str,
    params: dict[str, str | int | bool],
) -> dict[str, Any]:
    try:
        response = requests.get(
            f"https://www.googleapis.com/drive/v3/{path}",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        raise RuntimeError("Drive folder verification failed.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("Drive returned an invalid response.")
    return payload


def _verify_selected_empty_folder(
    access_token: str,
    folder_id: str,
) -> None:
    if not DRIVE_ID_PATTERN.fullmatch(folder_id):
        raise RuntimeError("The selected Drive folder ID is invalid.")
    metadata = _drive_get(
        access_token,
        f"files/{folder_id}",
        {
            "fields": (
                "id,mimeType,trashed,ownedByMe,createdTime,"
                "capabilities(canShare)"
            ),
            "supportsAllDrives": "true",
        },
    )
    capabilities = metadata.get("capabilities") or {}
    if not isinstance(capabilities, dict):
        capabilities = {}
    try:
        created_at = datetime.fromisoformat(
            str(metadata.get("createdTime") or "").replace("Z", "+00:00")
        )
        if created_at.tzinfo is None:
            raise ValueError
        folder_age = datetime.now(UTC) - created_at
    except (TypeError, ValueError) as error:
        raise RuntimeError("The test folder creation time is unavailable.") from error
    if not all(
        (
            metadata.get("id") == folder_id,
            metadata.get("mimeType") == FOLDER_MIME_TYPE,
            metadata.get("trashed") is not True,
            metadata.get("ownedByMe") is True,
            capabilities.get("canShare") is True,
            timedelta(0) <= folder_age <= MAX_TEST_FOLDER_AGE,
        )
    ):
        raise RuntimeError(
            "Select a shareable folder created and owned by you within 24 hours."
        )

    children = _drive_get(
        access_token,
        "files",
        {
            "q": f"'{folder_id}' in parents and trashed = false",
            "pageSize": 1,
            "fields": "files(id)",
            "spaces": "drive",
        },
    )
    if children.get("files"):
        raise RuntimeError("The selected test folder is not empty.")


def _new_worker_database():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )


def _seed_drive_operation(
    factory,
    recipient_email: str,
    settings: Settings,
):
    with factory() as session:
        member = LibraryMember(
            normalized_email=recipient_email.strip().lower(),
            normalized_student_number=None,
            full_name="Phase 7 Drive E2E recipient",
            academic_role="staff",
            faculty_code="pharmacy",
            grade=None,
            member_status="active",
        )
        session.add(member)
        session.flush()
        now = datetime.now(UTC)
        application = LibraryApplication(
            member_id=member.id,
            idempotency_key=hashlib.sha256(
                b"phase7-real-e2e-application"
            ).hexdigest(),
            normalized_email=member.normalized_email,
            normalized_student_number=None,
            full_name=member.full_name,
            academic_role=member.academic_role,
            faculty_code=member.faculty_code,
            grade=None,
            question=None,
            eligibility_status="manual_review",
            reason_codes=["role_requires_manual_review"],
            terms_version=None,
            terms_accepted_at=None,
            privacy_version="phase7-e2e",
            privacy_accepted_at=now,
            source="phase7_real_e2e",
            admin_decision="approved",
        )
        identity = LibraryIdentity(
            member_id=member.id,
            google_sub="phase7-drive-e2e-synthetic-recipient-link",
            verified_email=member.normalized_email,
            hosted_domain="st.kitasato-u.ac.jp",
            email_verified=True,
            issuer="https://accounts.google.com",
            audience="phase7-drive-e2e-synthetic-audience",
            last_verified_at=now,
        )
        session.add_all([application, identity])
        session.flush()
        grant = LibraryAccessGrant(
            member_id=member.id,
            resource_id=DRIVE_TARGET_ALIAS,
            target_alias=DRIVE_TARGET_ALIAS,
            role="reader",
            status="pending",
            managed_by_system=False,
            notification_status="pending",
        )
        session.add(grant)
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
        session.add(operation)
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
        return member.id, grant.id, operation.id


def build_sanitized_evidence(
    *,
    owner_subject_fingerprint: str,
    owner_email_domain: str,
    recipient_email: str,
    folder_id: str,
    permission_id: str,
    notification_received_confirmed: bool,
    recipient_view_confirmed: bool,
    recipient_edit_denied_confirmed: bool,
    recipient_revocation_confirmed: bool,
    permission_created: bool,
    replay_created_zero_permissions: bool,
    managed_permission_deleted: bool,
    permission_absent_after_delete: bool,
    oauth_revocation_endpoint_accepted: bool,
    oauth_refresh_invalid_grant_confirmed: bool,
) -> dict[str, object]:
    passed = all(
        (
            notification_received_confirmed,
            recipient_view_confirmed,
            recipient_edit_denied_confirmed,
            recipient_revocation_confirmed,
            permission_created,
            replay_created_zero_permissions,
            managed_permission_deleted,
            permission_absent_after_delete,
            oauth_revocation_endpoint_accepted,
            oauth_refresh_invalid_grant_confirmed,
        )
    )
    return {
        "status": "pass" if passed else "blocked",
        "purpose": "phase7_real_drive_e2e",
        "captured_at_utc": datetime.now(UTC).isoformat(),
        "scope": DRIVE_SCOPE,
        "owner_subject_fingerprint_sha256_16": owner_subject_fingerprint,
        "owner_email_domain": owner_email_domain,
        "recipient_fingerprint_sha256_16": _fingerprint(
            recipient_email.strip().lower()
        ),
        "recipient_email_domain": _email_domain(recipient_email),
        "folder_fingerprint_sha256_16": _fingerprint(folder_id),
        "permission_fingerprint_sha256_16": _fingerprint(permission_id),
        "new_reader_permission": permission_created,
        "standard_drive_notification_requested": True,
        "standard_drive_notification_received_confirmed": (
            notification_received_confirmed
        ),
        "idempotent_second_worker_run_created_zero_permissions": (
            replay_created_zero_permissions
        ),
        "recipient_view_confirmed": recipient_view_confirmed,
        "recipient_edit_denied_confirmed": recipient_edit_denied_confirmed,
        "recipient_revocation_confirmed": recipient_revocation_confirmed,
        "managed_permission_deleted": managed_permission_deleted,
        "permission_absent_after_delete": permission_absent_after_delete,
        "oauth_revocation_endpoint_accepted": oauth_revocation_endpoint_accepted,
        "oauth_refresh_invalid_grant_confirmed": (
            oauth_refresh_invalid_grant_confirmed
        ),
        "oauth_grant_revoked": (
            oauth_revocation_endpoint_accepted
            and oauth_refresh_invalid_grant_confirmed
        ),
        "tokens_codes_emails_or_drive_ids_persisted": False,
    }


def _save_evidence(evidence: dict[str, object], output_directory: str) -> Path:
    directory = Path(output_directory).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    path = directory / f"phase7-drive-e2e-{timestamp}.json"
    path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return path


def _layout(title: str, body: str) -> bytes:
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>{html.escape(title)}</title>
<style>body{{margin:0;background:#f2f5f0;color:#142133;font-family:system-ui,sans-serif}}
main{{max-width:760px;margin:40px auto;padding:32px;background:#fff;border-radius:18px}}
.button,button{{display:inline-block;border:0;border-radius:9px;padding:12px 18px;background:#174c3c;color:#fff;text-decoration:none;font:inherit;cursor:pointer}}
.danger{{background:#8a2f25}}.notice{{padding:14px;background:#edf4ef;border-radius:9px}}
li{{margin:.6em 0}}label{{display:block;margin:18px 0}}</style></head>
<body><main>{body}</main></body></html>""".encode("utf-8")


def _start_page(message: str = "") -> bytes:
    extra = f'<p class="notice">{html.escape(message)}</p>' if message else ""
    return _layout(
        "Phase 7 Drive E2E",
        f"""<h1>Phase 7 Drive E2E</h1>{extra}
<p>所有者OAuthとGoogle Pickerで、空のテストフォルダだけを選択します。</p>
<a class="button" href="/authorize">所有者Google認証を開始</a>
<h2>安全境界</h2><ul>
<li>本番フォルダを選択しないでください。</li>
<li>付与先は起動時に指定したテスト用アカウント1件だけです。</li>
<li>作成したreader権限は確認後に削除し、OAuth grantも失効します。</li>
<li>生token、認可code、メール全文、Drive IDは証跡へ保存しません。</li></ul>""",
    )


def _picker_page(
    *,
    api_key: str,
    app_id: str,
    access_token: str,
    csrf_token: str,
) -> bytes:
    config = json.dumps(
        {
            "apiKey": api_key,
            "appId": app_id,
            "accessToken": access_token,
            "csrf": csrf_token,
        }
    )
    return _layout(
        "テストフォルダを選択",
        f"""<h1>空のテストフォルダを選択</h1>
<p class="notice">本番フォルダではなく、新規作成した空フォルダを選択してください。</p>
<button id="open-picker" type="button" disabled>Google Pickerを開く</button>
<form id="selection" method="post" action="/select">
<input id="folder-id" name="folder_id" type="hidden">
<input name="csrf" type="hidden" value="{html.escape(csrf_token, quote=True)}">
</form>
<p id="status" role="status">Pickerを読み込んでいます。</p>
<script src="https://apis.google.com/js/api.js"></script>
<script>const cfg={config}; const button=document.getElementById('open-picker');
function pickerCallback(data){{if(data.action===google.picker.Action.PICKED){{
const doc=data.docs&&data.docs[0]; if(!doc||!doc.id){{return;}}
document.getElementById('folder-id').value=doc.id;
document.getElementById('status').textContent='選択したフォルダを安全確認しています。';
document.getElementById('selection').submit();}}}}
function pickerReady(){{const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS)
.setIncludeFolders(true).setSelectFolderEnabled(true);
button.disabled=false;document.getElementById('status').textContent='準備できました。';
button.addEventListener('click',()=>new google.picker.PickerBuilder().addView(view)
.setOAuthToken(cfg.accessToken).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId)
.setCallback(pickerCallback).setTitle('Phase 7 空テストフォルダを選択').build().setVisible(true));}}
gapi.load('picker',pickerReady);</script>""",
    )


def _confirm_grant_page(csrf_token: str) -> bytes:
    return _layout(
        "reader付与の最終確認",
        f"""<h1>実reader付与の最終確認</h1>
<p class="notice">選択先は空・共有可能で、付与先に既存permissionがないことを確認しました。</p>
<p>次の操作で、テスト用アカウントへGoogle Drive標準招待通知を伴うreader権限を1件作成します。</p>
<form method="post" action="/grant"><input type="hidden" name="csrf" value="{html.escape(csrf_token, quote=True)}">
<button class="danger" type="submit">テスト権限を作成する</button></form>""",
    )


def _verify_recipient_page(csrf_token: str) -> bytes:
    return _layout(
        "別アカウント確認",
        f"""<h1>reader付与を確認しました</h1>
<p class="notice">Phase 7実ワーカーがreader権限を1件作成し、再実行で重複が増えないことを確認しました。</p>
<ol><li>別ブラウザまたはInPrivateで、指定した受信アカウントへログインします。</li>
<li>Google Drive標準招待メールが届いたことを確認します。</li>
<li>テストフォルダを開けること、編集操作はできないことを確認します。</li></ol>
<form method="post" action="/cleanup"><input type="hidden" name="csrf" value="{html.escape(csrf_token, quote=True)}">
<label><input type="checkbox" name="notification_confirmed" value="yes" required> 標準招待通知の受信を確認しました。</label>
<label><input type="checkbox" name="view_confirmed" value="yes" required> 別アカウントでフォルダを閲覧できました。</label>
<label><input type="checkbox" name="edit_denied_confirmed" value="yes" required> 編集・追加・削除ができないことを確認しました。</label>
<button class="danger" type="submit">テスト権限を削除する</button></form>""",
    )


def _verify_revoked_page(csrf_token: str) -> bytes:
    return _layout(
        "権限削除後の確認",
        f"""<h1>テスト受信者のアクセス削除を確認</h1>
<p class="notice">ワーカーは、この試験で作成し管理対象と記録したpermissionだけを削除しました。</p>
<ol><li>テスト受信者側のブラウザを再読み込みします。</li>
<li>テストフォルダを開けなくなったことを確認します。</li>
<li>この画面へ戻り、一時的な所有者OAuth grantを失効します。</li></ol>
<form method="post" action="/finalize"><input type="hidden" name="csrf" value="{html.escape(csrf_token, quote=True)}">
<label><input type="checkbox" name="revocation_confirmed" value="yes" required> テスト受信者がフォルダを閲覧できないことを確認しました。</label>
<button class="danger" type="submit">OAuth grantを失効し証跡を保存する</button></form>""",
    )


def create_handler(
    *,
    client_id: str,
    client_secret: str,
    picker_api_key: str,
    picker_app_id: str,
    recipient_email: str,
    output_directory: str,
):
    lock = threading.RLock()
    flow: dict[str, Any] = {
        "oauth_states": set(),
        "csrf": secrets.token_urlsafe(32),
        "message": "",
        "stage": "start",
        "terminal": False,
    }

    def cleanup_oauth() -> tuple[bool, bool]:
        refresh_token = str(flow.pop("refresh_token", ""))
        flow.pop("access_token", None)
        if not refresh_token:
            return False, False
        try:
            revoked = _revoke(refresh_token)
        except RuntimeError:
            revoked = False
        try:
            rejected = _refresh_token_is_rejected(
                refresh_token,
                client_id=client_id,
                client_secret=client_secret,
            )
        except RuntimeError:
            rejected = False
        return revoked, rejected

    def abort_test(message: str) -> None:
        if flow.get("terminal"):
            return
        client = flow.get("client")
        folder_id = str(flow.get("folder_id") or "")
        permission_id = ""
        factory = flow.get("factory")
        grant_id = flow.get("grant_id")
        if factory is not None and grant_id is not None:
            try:
                with factory() as session:
                    grant = session.get(LibraryAccessGrant, grant_id)
                    if (
                        grant is not None
                        and grant.managed_by_system
                        and grant.permission_id
                    ):
                        permission_id = grant.permission_id
            except Exception:
                permission_id = ""
        if client is not None and folder_id and permission_id:
            try:
                permission = client.find_permission(folder_id, recipient_email)
                if (
                    permission is not None
                    and permission.permission_id == permission_id
                ):
                    client.delete_permission(folder_id, permission_id)
                    permission = client.find_permission(folder_id, recipient_email)
                if permission is not None:
                    message = (
                        f"{message} Drive共有設定を手動確認してください。"
                        "helperは記録したmanaged permission以外を削除していません。"
                    )
            except Exception:
                message = (
                    f"{message} Drive共有設定を手動確認し、テスト受信者の"
                    "権限が残っていれば削除してください。"
                )
        cleanup_oauth()
        engine = flow.pop("engine", None)
        if engine is not None:
            engine.dispose()
        for key in (
            "client",
            "settings",
            "factory",
            "member_id",
            "grant_id",
            "operation_id",
            "permission_id",
            "folder_id",
            "owner",
        ):
            flow.pop(key, None)
        flow["message"] = message
        flow["stage"] = "start"

    def _shutdown_cleanup() -> None:
        with lock:
            if flow.get("terminal"):
                return
            abort_test(
                "The helper stopped before Phase 7B cleanup was verified."
            )

    class Handler(BaseHTTPRequestHandler):
        server_version = "Phase7DriveE2E/1.0"
        sys_version = ""
        shutdown_cleanup = staticmethod(_shutdown_cleanup)

        def log_message(self, format: str, *args: object) -> None:
            return

        def end_headers(self) -> None:
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
            self.send_header(
                "Permissions-Policy",
                "camera=(), microphone=(), geolocation=(), payment=()",
            )
            super().end_headers()

        def _send(self, page: bytes, status: HTTPStatus = HTTPStatus.OK) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)

        def _redirect(self, location: str) -> None:
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", location)
            self.end_headers()

        def _local_request(self) -> bool:
            if _valid_local_host(str(self.headers.get("Host") or "")):
                return True
            self.send_error(HTTPStatus.MISDIRECTED_REQUEST)
            return False

        def _form(self) -> dict[str, list[str]] | None:
            if self.headers.get("Transfer-Encoding"):
                self.send_error(HTTPStatus.BAD_REQUEST)
                return None
            content_type = str(self.headers.get("Content-Type") or "").split(";", 1)[0]
            if content_type.lower() != "application/x-www-form-urlencoded":
                self.send_error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
                return None
            try:
                length = int(str(self.headers.get("Content-Length") or ""))
            except ValueError:
                self.send_error(HTTPStatus.LENGTH_REQUIRED)
                return None
            if length <= 0:
                self.send_error(HTTPStatus.LENGTH_REQUIRED)
                return None
            if length > MAX_REQUEST_BYTES:
                self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
                return None
            try:
                return parse_qs(
                    self.rfile.read(length).decode("utf-8"),
                    strict_parsing=True,
                )
            except (UnicodeDecodeError, ValueError):
                self.send_error(HTTPStatus.BAD_REQUEST)
                return None

        def _valid_csrf(self, form: dict[str, list[str]]) -> bool:
            supplied = str(form.get("csrf", [""])[0])
            return secrets.compare_digest(supplied, str(flow["csrf"]))

        def _at_stage(self, expected: str) -> bool:
            with lock:
                valid = flow.get("stage") == expected
            if not valid:
                self.send_error(HTTPStatus.CONFLICT)
            return valid

        def do_GET(self) -> None:
            if not self._local_request():
                return
            parsed = urlparse(self.path)
            if parsed.path == "/":
                stage = str(flow.get("stage") or "start")
                if stage == "picker":
                    self._redirect("/picker")
                    return
                if stage == "grant_confirmation":
                    self._send(_confirm_grant_page(str(flow["csrf"])))
                    return
                if stage == "recipient_confirmation":
                    self._send(_verify_recipient_page(str(flow["csrf"])))
                    return
                if stage == "revocation_confirmation":
                    self._send(_verify_revoked_page(str(flow["csrf"])))
                    return
                if stage == "oauth_pending":
                    self._send(
                        _start_page(
                            "Google OAuthの応答待ちです。認証画面を完了してください。"
                        )
                    )
                    return
                self._send(_start_page(str(flow.get("message") or "")))
                return
            if parsed.path == "/authorize":
                state = secrets.token_urlsafe(32)
                with lock:
                    if not _transition(flow, "start", "oauth_pending"):
                        self.send_error(HTTPStatus.CONFLICT)
                        return
                    flow["oauth_states"] = {state}
                self._redirect(_authorization_url(client_id, state))
                return
            if parsed.path == "/picker":
                if not self._at_stage("picker"):
                    return
                access_token = str(flow.get("access_token") or "")
                if not access_token:
                    self._redirect("/")
                    return
                self._send(
                    _picker_page(
                        api_key=picker_api_key,
                        app_id=picker_app_id,
                        access_token=access_token,
                        csrf_token=str(flow["csrf"]),
                    )
                )
                return
            if parsed.path != "/oauth2/callback":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            if not self._at_stage("oauth_pending"):
                return

            query = parse_qs(parsed.query)
            state = str(query.get("state", [""])[0])
            code = str(query.get("code", [""])[0])
            oauth_error = str(query.get("error", [""])[0])
            with lock:
                state_valid = state in flow["oauth_states"]
                flow["oauth_states"].discard(state)
            if not state_valid or oauth_error or not code:
                flow["message"] = "Google認証が完了しませんでした。再試行してください。"
                flow["stage"] = "start"
                self._redirect("/")
                return
            refresh_token = ""
            try:
                payload = _exchange_code(
                    code,
                    client_id=client_id,
                    client_secret=client_secret,
                )
                access_token = str(payload.get("access_token") or "")
                refresh_token = str(payload.get("refresh_token") or "")
                id_token = str(payload.get("id_token") or "")
                granted_scopes = set(str(payload.get("scope") or "").split())
                if not all(
                    (
                        access_token,
                        refresh_token,
                        id_token,
                        DRIVE_SCOPE in granted_scopes,
                    )
                ):
                    raise RuntimeError("Required OAuth values are missing.")
                owner = _verify_id_token(id_token, client_id)
                if owner["normalized_email"] == recipient_email.strip().lower():
                    raise RuntimeError("The owner and test recipient must differ.")
            except RuntimeError:
                if refresh_token:
                    try:
                        _revoke(refresh_token)
                        _refresh_token_is_rejected(
                            refresh_token,
                            client_id=client_id,
                            client_secret=client_secret,
                        )
                    except RuntimeError:
                        pass
                flow["message"] = "OAuth検証に失敗しました。Cloud設定を確認してください。"
                flow["stage"] = "start"
                self._redirect("/")
                return
            with lock:
                if not _transition(flow, "oauth_pending", "picker"):
                    try:
                        _revoke(refresh_token)
                    except RuntimeError:
                        pass
                    self.send_error(HTTPStatus.CONFLICT)
                    return
                flow.update(
                    {
                        "access_token": access_token,
                        "refresh_token": refresh_token,
                        "owner": owner,
                    }
                )
            self._redirect("/picker")

        def do_POST(self) -> None:
            if not self._local_request():
                return
            parsed = urlparse(self.path)
            form = self._form()
            if form is None:
                return
            if not self._valid_csrf(form):
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            if parsed.path == "/select":
                if not self._at_stage("picker"):
                    return
                folder_id = str(form.get("folder_id", [""])[0]).strip()
                access_token = str(flow.get("access_token") or "")
                if not folder_id or not access_token:
                    self.send_error(HTTPStatus.BAD_REQUEST)
                    return
                try:
                    _verify_selected_empty_folder(access_token, folder_id)
                    settings = Settings(
                        external_side_effects_enabled=True,
                        phase7_worker_api_enabled=True,
                        phase7_drive_api_enabled=True,
                        phase7_drive_kill_switch=False,
                        phase7_worker_secret="phase7-local-e2e-worker-secret-32-chars",
                        drive_resource_id=folder_id,
                        google_drive_oauth_client_id=client_id,
                        google_drive_oauth_client_secret=client_secret,
                        google_drive_oauth_refresh_token=str(flow["refresh_token"]),
                    )
                    client = GoogleDrivePermissionClient(settings)
                    if client.find_permission(folder_id, recipient_email) is not None:
                        raise RuntimeError("Recipient already has access.")
                except RuntimeError:
                    abort_test(
                        "空の所有フォルダ、または既存権限のない受信先を選んで再試行してください。"
                    )
                    self._redirect("/")
                    return
                engine, factory = _new_worker_database()
                member_id, grant_id, operation_id = _seed_drive_operation(
                    factory,
                    recipient_email,
                    settings,
                )
                flow.update(
                    {
                        "folder_id": folder_id,
                        "settings": settings,
                        "client": client,
                        "engine": engine,
                        "factory": factory,
                        "member_id": member_id,
                        "grant_id": grant_id,
                        "operation_id": operation_id,
                        "stage": "grant_confirmation",
                    }
                )
                self._send(_confirm_grant_page(str(flow["csrf"])))
                return

            if parsed.path == "/grant":
                if not self._at_stage("grant_confirmation"):
                    return
                try:
                    factory = flow["factory"]
                    with factory() as session:
                        results = process_due_drive_operations(
                            session,
                            flow["client"],
                            flow["settings"],
                            limit=1,
                            worker_id="phase7-real-e2e",
                        )
                        second_run = process_due_drive_operations(
                            session,
                            flow["client"],
                            flow["settings"],
                            limit=1,
                            worker_id="phase7-real-e2e",
                        )
                        grant = session.get(LibraryAccessGrant, flow["grant_id"])
                        if (
                            len(results) != 1
                            or results[0].status != "succeeded"
                            or second_run
                            or grant is None
                            or grant.status != "granted"
                            or not grant.managed_by_system
                            or not grant.permission_id
                        ):
                            raise RuntimeError("Phase 7 grant worker did not pass.")
                        flow["permission_id"] = grant.permission_id
                        flow["permission_created"] = True
                        flow["replay_created_zero_permissions"] = not second_run
                except Exception:
                    abort_test(
                        "実Drive付与がBLOCKEDです。作成された可能性があるテスト権限を削除し、OAuthを失効しました。"
                    )
                    self._redirect("/")
                    return
                flow["stage"] = "recipient_confirmation"
                self._send(_verify_recipient_page(str(flow["csrf"])))
                return

            if parsed.path == "/cleanup":
                if not self._at_stage("recipient_confirmation"):
                    return
                notification_confirmed = (
                    form.get("notification_confirmed", [""])[0] == "yes"
                )
                view_confirmed = form.get("view_confirmed", [""])[0] == "yes"
                edit_denied_confirmed = (
                    form.get("edit_denied_confirmed", [""])[0] == "yes"
                )
                if not all(
                    (
                        notification_confirmed,
                        view_confirmed,
                        edit_denied_confirmed,
                    )
                ):
                    self.send_error(HTTPStatus.BAD_REQUEST)
                    return
                try:
                    factory = flow["factory"]
                    with factory() as session:
                        enqueue_drive_revoke(
                            session,
                            flow["member_id"],
                            flow["settings"],
                        )
                        results = process_due_drive_operations(
                            session,
                            flow["client"],
                            flow["settings"],
                            limit=1,
                            worker_id="phase7-real-e2e",
                        )
                        grant = session.scalar(select(LibraryAccessGrant))
                        if (
                            len(results) != 1
                            or results[0].status != "succeeded"
                            or grant is None
                            or grant.status != "revoked"
                            or not grant.managed_by_system
                            or grant.permission_id != flow["permission_id"]
                        ):
                            raise RuntimeError("Phase 7 revoke worker did not pass.")
                    permission = flow["client"].find_permission(
                        flow["folder_id"], recipient_email
                    )
                    if permission is not None:
                        raise RuntimeError("Managed permission still exists after revoke.")
                except Exception:
                    abort_test(
                        "cleanupがBLOCKEDです。"
                    )
                    self._send(
                        _start_page(
                            str(flow["message"])
                        ),
                        HTTPStatus.INTERNAL_SERVER_ERROR,
                    )
                    return
                flow["notification_received_confirmed"] = notification_confirmed
                flow["recipient_view_confirmed"] = view_confirmed
                flow["recipient_edit_denied_confirmed"] = edit_denied_confirmed
                flow["managed_permission_deleted"] = True
                flow["permission_absent_after_delete"] = True
                flow["stage"] = "revocation_confirmation"
                self._send(_verify_revoked_page(str(flow["csrf"])))
                return

            if parsed.path == "/finalize":
                if not self._at_stage("revocation_confirmation"):
                    return
                confirmed = form.get("revocation_confirmed", [""])[0] == "yes"
                if not confirmed or not flow.get("managed_permission_deleted"):
                    self.send_error(HTTPStatus.BAD_REQUEST)
                    return
                try:
                    revoke_accepted, refresh_rejected = cleanup_oauth()
                    owner = flow["owner"]
                    evidence = build_sanitized_evidence(
                        owner_subject_fingerprint=owner["subject_fingerprint"],
                        owner_email_domain=owner["email_domain"],
                        recipient_email=recipient_email,
                        folder_id=flow["folder_id"],
                        permission_id=flow["permission_id"],
                        notification_received_confirmed=bool(
                            flow.get("notification_received_confirmed")
                        ),
                        recipient_view_confirmed=bool(
                            flow.get("recipient_view_confirmed")
                        ),
                        recipient_edit_denied_confirmed=bool(
                            flow.get("recipient_edit_denied_confirmed")
                        ),
                        recipient_revocation_confirmed=confirmed,
                        permission_created=bool(flow.get("permission_created")),
                        replay_created_zero_permissions=bool(
                            flow.get("replay_created_zero_permissions")
                        ),
                        managed_permission_deleted=bool(
                            flow.get("managed_permission_deleted")
                        ),
                        permission_absent_after_delete=bool(
                            flow.get("permission_absent_after_delete")
                        ),
                        oauth_revocation_endpoint_accepted=revoke_accepted,
                        oauth_refresh_invalid_grant_confirmed=refresh_rejected,
                    )
                    output_path = _save_evidence(evidence, output_directory)
                    flow["engine"].dispose()
                    flow["finished"] = evidence["status"] == "pass"
                    flow["terminal"] = True
                    flow["stage"] = "finished"
                except Exception:
                    abort_test("OAuth cleanup or evidence write is BLOCKED.")
                    self._send(
                        _start_page(str(flow["message"])),
                        HTTPStatus.INTERNAL_SERVER_ERROR,
                    )
                    return
                self._send(
                    _layout(
                        "Phase 7 Drive E2E完了",
                        f"""<h1>Phase 7 Drive E2E: {html.escape(str(evidence['status']).upper())}</h1>
<p class="notice">reader権限を削除し、OAuth grantを失効しました。</p>
<p>秘密情報を含まない証跡を保存しました。ウィンドウを閉じて構いません。</p>""",
                    )
                )
                print(f"Phase 7 Drive E2E {evidence['status']}; sanitized_file={output_path}")
                threading.Timer(3, self.server.shutdown).start()
                return

            self.send_error(HTTPStatus.NOT_FOUND)

    return Handler


def main() -> int:
    required = {
        "client_id": os.environ.get("PHASE7_GOOGLE_OAUTH_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get(
            "PHASE7_GOOGLE_OAUTH_CLIENT_SECRET", ""
        ).strip(),
        "picker_api_key": os.environ.get("PHASE7_GOOGLE_PICKER_API_KEY", "").strip(),
        "picker_app_id": os.environ.get("PHASE7_GOOGLE_PICKER_APP_ID", "").strip(),
        "recipient_email": os.environ.get("PHASE7_DRIVE_TEST_RECIPIENT", "").strip(),
        "output_directory": os.environ.get("PHASE7_DRIVE_E2E_OUTPUT_DIR", "").strip(),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print(f"Missing required process values: {', '.join(missing)}")
        return 2
    if "@" not in required["recipient_email"]:
        print("PHASE7_DRIVE_TEST_RECIPIENT is invalid.")
        return 2

    server = HTTPServer((HOST, PORT), create_handler(**required))
    print(f"Open http://localhost:{PORT}/")
    print("Use only a new empty test folder; secrets and identifiers are not logged.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.RequestHandlerClass.shutdown_cleanup()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
