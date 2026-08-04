"""Fail-closed production Drive OAuth and Secret Manager bootstrap.

The helper is deliberately separate from the Phase 7 permission E2E. It never
creates, lists, updates, or deletes Drive permissions. OAuth credentials and
the selected Drive folder ID remain in process memory and are streamed to
pre-existing Google Secret Manager containers over ``gcloud ... --data-file=-``.
Only secret IDs, numeric versions, and SHA-256 fingerprints are emitted.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import hmac
import html
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import re
import secrets
import subprocess
import threading
from typing import Any, Callable, Protocol, Sequence
from urllib.parse import parse_qs, urlencode, urlparse

import requests

from app.drive_client import DRIVE_FILE_SCOPE


HOST = "127.0.0.1"
PORT = 8769
REDIRECT_URI = f"http://localhost:{PORT}/oauth2/callback"
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
MAX_REQUEST_BYTES = 20_000
EXACT_CONFIRMATION = "I_APPROVED_PRODUCTION_DRIVE_CREDENTIAL_BOOTSTRAP_V1"
SCOPES = ("openid", "email", DRIVE_FILE_SCOPE)
SECRET_VALUE_BINDINGS = (
    ("fsl-drive-oauth-client-id", "client_id"),
    ("fsl-drive-oauth-client-secret", "client_secret"),
    ("fsl-drive-oauth-refresh-token", "refresh_token"),
    ("fsl-drive-resource-id", "folder_id"),
)
ALLOWED_HOST_HEADERS = {
    f"localhost:{PORT}",
    f"127.0.0.1:{PORT}",
}
ALLOWED_ORIGINS = {
    f"http://localhost:{PORT}",
    f"http://127.0.0.1:{PORT}",
}
DRIVE_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{10,200}")
PROJECT_ID_PATTERN = re.compile(r"[a-z][a-z0-9-]{4,28}[a-z0-9]")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
FINGERPRINT16_PATTERN = re.compile(r"[0-9a-f]{16}")
SECRET_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,255}")
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


class SecretSinkError(RuntimeError):
    """A sanitized Secret Manager sink failure."""


@dataclass(frozen=True)
class SecretVersionRecord:
    secret_id: str
    version: int
    value_fingerprint_sha256_16: str


class SecretVersionSink(Protocol):
    def assert_existing(self, secret_ids: Sequence[str]) -> None: ...

    def add_version(self, secret_id: str, value: str) -> int: ...


Runner = Callable[..., subprocess.CompletedProcess[str]]


class GcloudSecretManagerSink:
    """Streams values to existing secrets without placing payloads in argv."""

    def __init__(
        self,
        project_id: str,
        *,
        executable: str = "gcloud",
        runner: Runner = subprocess.run,
    ) -> None:
        if PROJECT_ID_PATTERN.fullmatch(project_id) is None:
            raise SecretSinkError("Google Cloud project ID is invalid.")
        self._project_id = project_id
        self._executable = executable
        self._runner = runner

    def _run(
        self,
        arguments: list[str],
        *,
        input_text: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return self._runner(
                [self._executable, *arguments],
                input=input_text,
                text=True,
                capture_output=True,
                timeout=45,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise SecretSinkError("Google Secret Manager command failed.") from error

    def assert_existing(self, secret_ids: Sequence[str]) -> None:
        for secret_id in secret_ids:
            if SECRET_ID_PATTERN.fullmatch(secret_id) is None:
                raise SecretSinkError("Secret ID is invalid.")
            result = self._run(
                [
                    "secrets",
                    "describe",
                    secret_id,
                    f"--project={self._project_id}",
                    "--format=value(name)",
                    "--quiet",
                ]
            )
            if result.returncode != 0:
                raise SecretSinkError("A required Secret Manager container is unavailable.")
            resource_name = result.stdout.strip().replace("\\", "/")
            if not resource_name.endswith(f"/secrets/{secret_id}"):
                raise SecretSinkError("Secret Manager returned an unexpected resource.")

    def add_version(self, secret_id: str, value: str) -> int:
        if SECRET_ID_PATTERN.fullmatch(secret_id) is None or not value:
            raise SecretSinkError("Secret version input is invalid.")
        result = self._run(
            [
                "secrets",
                "versions",
                "add",
                secret_id,
                f"--project={self._project_id}",
                "--data-file=-",
                "--format=value(name)",
                "--quiet",
            ],
            input_text=value,
        )
        if result.returncode != 0:
            raise SecretSinkError("Secret Manager rejected a version write.")
        match = re.search(
            rf"/secrets/{re.escape(secret_id)}/versions/([1-9][0-9]*)$",
            result.stdout.strip().replace("\\", "/"),
        )
        if match is None:
            raise SecretSinkError("Secret Manager returned an invalid version reference.")
        return int(match.group(1))


class PartialSecretWriteError(SecretSinkError):
    def __init__(self, records: Sequence[SecretVersionRecord]) -> None:
        super().__init__("Secret Manager version streaming was incomplete.")
        self.records = tuple(records)


@dataclass
class BootstrapOutcome:
    """Carries the terminal result without exposing any bootstrap values."""

    status: str = "incomplete"

    @property
    def exit_code(self) -> int:
        return 0 if self.status == "pass" else 4


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _valid_local_host(value: str) -> bool:
    return value.strip().lower() in ALLOWED_HOST_HEADERS


def _valid_local_origin(value: str) -> bool:
    return value.strip().lower() in ALLOWED_ORIGINS


def _transition(flow: dict[str, Any], expected: str, target: str) -> bool:
    if flow.get("stage") != expected:
        return False
    flow["stage"] = target
    return True


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
    try:
        payload = response.json()
    except ValueError as error:
        raise RuntimeError("Google OAuth returned an invalid response.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("Google OAuth returned an invalid response.")
    return payload


def _verify_id_token(id_token: str, client_id: str) -> str:
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
    if not all(
        (
            claims.get("aud") == client_id,
            claims.get("iss") in VALID_ISSUERS,
            expires_at > int(datetime.now(UTC).timestamp()),
            str(claims.get("email_verified", "")).lower() == "true",
            bool(str(claims.get("sub") or "")),
        )
    ):
        raise RuntimeError("Google ID token claims were rejected.")
    return _fingerprint(str(claims["sub"]))[:16]


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


def _verify_selected_production_folder(
    access_token: str,
    folder_id: str,
    approved_fingerprint: str,
) -> str:
    if DRIVE_ID_PATTERN.fullmatch(folder_id) is None:
        raise RuntimeError("The selected Drive folder is invalid.")
    if SHA256_PATTERN.fullmatch(approved_fingerprint) is None:
        raise RuntimeError("The approved folder fingerprint is invalid.")
    metadata = _drive_get(
        access_token,
        f"files/{folder_id}",
        {
            "fields": "id,mimeType,trashed,ownedByMe,capabilities(canShare)",
            "supportsAllDrives": "true",
        },
    )
    capabilities = metadata.get("capabilities") or {}
    if not isinstance(capabilities, dict):
        capabilities = {}
    if not all(
        (
            metadata.get("id") == folder_id,
            metadata.get("mimeType") == FOLDER_MIME_TYPE,
            metadata.get("trashed") is not True,
            metadata.get("ownedByMe") is True,
            capabilities.get("canShare") is True,
        )
    ):
        raise RuntimeError(
            "The selected item is not an owned, shareable, active Drive folder."
        )
    actual_fingerprint = _fingerprint(folder_id)
    if not hmac.compare_digest(actual_fingerprint, approved_fingerprint):
        raise RuntimeError(
            "The selected folder fingerprint does not match the human-approved record."
        )
    return actual_fingerprint[:16]


def stream_secret_versions(
    sink: SecretVersionSink,
    values: dict[str, str],
) -> tuple[SecretVersionRecord, ...]:
    records: list[SecretVersionRecord] = []
    try:
        sink.assert_existing([secret_id for secret_id, _ in SECRET_VALUE_BINDINGS])
        for secret_id, value_key in SECRET_VALUE_BINDINGS:
            value = values[value_key]
            version = sink.add_version(secret_id, value)
            records.append(
                SecretVersionRecord(
                    secret_id=secret_id,
                    version=version,
                    value_fingerprint_sha256_16=_fingerprint(value)[:16],
                )
            )
    except (SecretSinkError, KeyError) as error:
        raise PartialSecretWriteError(records) from error
    return tuple(records)


def build_sanitized_result(
    *,
    status: str,
    owner_subject_fingerprint: str,
    folder_fingerprint: str,
    records: Sequence[SecretVersionRecord],
) -> dict[str, object]:
    if (
        FINGERPRINT16_PATTERN.fullmatch(owner_subject_fingerprint) is None
        or FINGERPRINT16_PATTERN.fullmatch(folder_fingerprint) is None
        or any(
            SECRET_ID_PATTERN.fullmatch(record.secret_id) is None
            or record.version < 1
            or FINGERPRINT16_PATTERN.fullmatch(
                record.value_fingerprint_sha256_16
            )
            is None
            for record in records
        )
    ):
        raise ValueError("Sanitized bootstrap result is invalid.")
    return {
        "status": status,
        "purpose": "production_drive_oauth_secret_bootstrap",
        "captured_at_utc": datetime.now(UTC).isoformat(),
        "owner_subject_fingerprint_sha256_16": owner_subject_fingerprint,
        "folder_fingerprint_sha256_16": folder_fingerprint,
        "secret_versions": [
            {
                "secret_id": record.secret_id,
                "version": record.version,
                "value_fingerprint_sha256_16": (
                    record.value_fingerprint_sha256_16
                ),
            }
            for record in records
        ],
        "drive_permissions_mutated": False,
        "raw_credentials_or_drive_ids_persisted": False,
    }


def _layout(title: str, body: str) -> bytes:
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>{html.escape(title)}</title>
<style>body{{margin:0;background:#f2f5f0;color:#142133;font-family:system-ui,sans-serif}}
main{{max-width:760px;margin:40px auto;padding:32px;background:#fff;border-radius:18px}}
.button,button{{display:inline-block;border:0;border-radius:9px;padding:12px 18px;background:#174c3c;color:#fff;text-decoration:none;font:inherit;cursor:pointer}}
.danger{{background:#8a2f25}}.notice{{padding:14px;background:#edf4ef;border-radius:9px}}
code{{overflow-wrap:anywhere}}li{{margin:.6em 0}}label{{display:block;margin:18px 0}}</style></head>
<body><main>{body}</main></body></html>""".encode("utf-8")


def _start_page(message: str = "") -> bytes:
    extra = f'<p class="notice">{html.escape(message)}</p>' if message else ""
    return _layout(
        "Production Drive OAuth bootstrap",
        f"""<h1>Production Drive OAuth bootstrap</h1>{extra}
<p>所有者OAuthとGoogle Pickerで、人間が承認したfingerprintの本番folderだけを選択します。</p>
<a class="button" href="/authorize">所有者Google認証を開始</a>
<h2>このhelperが行わないこと</h2><ul>
<li>Drive permissionの作成・変更・削除</li>
<li>worker、Scheduler、Terraform activationの有効化</li>
<li>token、client secret、folder IDのlocal保存・console出力</li>
<li>Secret Manager containerの新規作成</li></ul>""",
    )


def _picker_page(
    *,
    api_key: str,
    app_id: str,
    access_token: str,
    message: str = "",
) -> bytes:
    config = json.dumps(
        {"apiKey": api_key, "appId": app_id, "accessToken": access_token}
    ).replace("</", "<\\/")
    extra = f'<p class="notice">{html.escape(message)}</p>' if message else ""
    return _layout(
        "承認済み本番folderを選択",
        f"""<h1>承認済み本番folderを選択</h1>
<p class="notice">承認記録と一致するfolderだけをPickerから選択してください。</p>{extra}
<button id="picker" type="button">Google Pickerを開く</button>
<form id="selection" method="post" action="/select"><input id="folder" type="hidden" name="folder"></form>
<script src="https://apis.google.com/js/api.js"></script><script>
const config={config};
document.getElementById('picker').addEventListener('click',()=>{{
  gapi.load('picker',{{callback:()=>{{
    const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true).setSelectFolderEnabled(true)
      .setMimeTypes('{FOLDER_MIME_TYPE}');
    const picker=new google.picker.PickerBuilder().setDeveloperKey(config.apiKey)
      .setAppId(config.appId).setOAuthToken(config.accessToken).addView(view)
      .setCallback(data=>{{
        if(data.action===google.picker.Action.PICKED&&data.docs&&data.docs.length===1){{
          document.getElementById('folder').value=data.docs[0].id;
          document.getElementById('selection').submit();
        }}
      }}).build();
    picker.setVisible(true);
  }}}});
}});
</script>""",
    )


def _confirmation_page(folder_fingerprint: str) -> bytes:
    secret_items = "".join(
        f"<li><code>{html.escape(secret_id)}</code></li>"
        for secret_id, _ in SECRET_VALUE_BINDINGS
    )
    return _layout(
        "Secret Manager書込みの最終確認",
        f"""<h1>Secret Manager書込みの最終確認</h1>
<p class="notice">folder fingerprint: <code>{html.escape(folder_fingerprint)}</code>（承認記録と一致）</p>
<p>次の既存containerへ新しいversionを1件ずつ追加します。workerは有効化しません。</p>
<ul>{secret_items}</ul>
<form method="post" action="/commit">
<label>確認phraseを完全一致で入力
<input name="confirmation" autocomplete="off" spellcheck="false" style="width:100%;padding:10px" required></label>
<p><code>{EXACT_CONFIRMATION}</code></p>
<button class="danger" type="submit">既存Secret Managerへ直接streamする</button></form>""",
    )


def _result_page(result: dict[str, object]) -> bytes:
    records = result["secret_versions"]
    assert isinstance(records, list)
    items = "".join(
        "<li><code>{}</code>: version {} / value fingerprint {}</li>".format(
            html.escape(str(record["secret_id"])),
            html.escape(str(record["version"])),
            html.escape(str(record["value_fingerprint_sha256_16"])),
        )
        for record in records
        if isinstance(record, dict)
    )
    return _layout(
        "Production Drive bootstrap result",
        f"""<h1>Production Drive bootstrap: {html.escape(str(result['status']).upper())}</h1>
<p class="notice">Drive permissionは変更されていません。worker activationも未実施です。</p>
<p>folder fingerprint: <code>{html.escape(str(result['folder_fingerprint_sha256_16']))}</code></p>
<ul>{items}</ul><p>このwindowを閉じて構いません。</p>""",
    )


def create_handler(
    *,
    client_id: str,
    client_secret: str,
    picker_api_key: str,
    picker_app_id: str,
    approved_folder_fingerprint: str,
    secret_sink: SecretVersionSink,
    outcome: BootstrapOutcome | None = None,
):
    outcome = outcome or BootstrapOutcome()
    flow: dict[str, Any] = {
        "stage": "start",
        "oauth_state": "",
        "access_token": "",
        "refresh_token": "",
        "owner_subject_fingerprint": "",
        "folder_id": "",
        "folder_fingerprint": "",
    }

    def clear_sensitive_flow() -> None:
        for key in ("access_token", "refresh_token", "folder_id", "oauth_state"):
            flow[key] = ""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *args: object) -> None:
            # Default logging would persist the OAuth callback query string.
            return

        def _send(
            self,
            content: bytes,
            status: HTTPStatus = HTTPStatus.OK,
            *,
            location: str | None = None,
        ) -> None:
            self.send_response(status)
            if location is not None:
                self.send_header("Location", location)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            if content:
                self.wfile.write(content)

        def _reject_invalid_host(self) -> bool:
            if _valid_local_host(self.headers.get("Host", "")):
                return False
            self._send(
                _layout("Rejected", "<h1>Invalid loopback Host</h1>"),
                HTTPStatus.MISDIRECTED_REQUEST,
            )
            return True

        def _read_form(self) -> dict[str, list[str]] | None:
            if not _valid_local_origin(self.headers.get("Origin", "")):
                self._send(
                    _layout("Rejected", "<h1>Invalid loopback Origin</h1>"),
                    HTTPStatus.FORBIDDEN,
                )
                return None
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length < 0 or length > MAX_REQUEST_BYTES:
                self._send(
                    _layout("Rejected", "<h1>Request too large</h1>"),
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
                return None
            if self.headers.get_content_type() != "application/x-www-form-urlencoded":
                self._send(
                    _layout("Rejected", "<h1>Invalid form content type</h1>"),
                    HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                )
                return None
            raw = self.rfile.read(length)
            try:
                decoded = raw.decode("utf-8", errors="strict")
            except UnicodeDecodeError:
                self._send(
                    _layout("Rejected", "<h1>Invalid form encoding</h1>"),
                    HTTPStatus.BAD_REQUEST,
                )
                return None
            return parse_qs(decoded, keep_blank_values=True)

        def do_GET(self) -> None:  # noqa: N802
            if self._reject_invalid_host():
                return
            parsed = urlparse(self.path)
            if parsed.path == "/":
                self._send(_start_page())
                return
            if parsed.path == "/authorize":
                if not _transition(flow, "start", "oauth_pending"):
                    self._send(_start_page("この認証stageは再実行できません。"), HTTPStatus.CONFLICT)
                    return
                flow["oauth_state"] = secrets.token_urlsafe(32)
                self._send(
                    b"",
                    HTTPStatus.SEE_OTHER,
                    location=_authorization_url(client_id, flow["oauth_state"]),
                )
                return
            if parsed.path == "/oauth2/callback":
                if flow.get("stage") != "oauth_pending":
                    self._send(_start_page("OAuth callback stageが無効です。"), HTTPStatus.CONFLICT)
                    return
                query = parse_qs(parsed.query)
                state = str((query.get("state") or [""])[0])
                code = str((query.get("code") or [""])[0])
                if not code or not hmac.compare_digest(state, str(flow["oauth_state"])):
                    clear_sensitive_flow()
                    flow["stage"] = "blocked"
                    self._send(_start_page("OAuth callbackを検証できません。"), HTTPStatus.BAD_REQUEST)
                    return
                try:
                    tokens = _exchange_code(
                        code,
                        client_id=client_id,
                        client_secret=client_secret,
                    )
                    access_token = str(tokens.get("access_token") or "")
                    refresh_token = str(tokens.get("refresh_token") or "")
                    id_token = str(tokens.get("id_token") or "")
                    if not access_token or not refresh_token or not id_token:
                        raise RuntimeError("Offline OAuth credentials are incomplete.")
                    owner_fingerprint = _verify_id_token(id_token, client_id)
                except RuntimeError:
                    clear_sensitive_flow()
                    flow["stage"] = "blocked"
                    self._send(
                        _start_page("OAuth検証またはoffline refresh token取得がBLOCKEDです。"),
                        HTTPStatus.BAD_REQUEST,
                    )
                    return
                flow.update(
                    stage="picker",
                    access_token=access_token,
                    refresh_token=refresh_token,
                    owner_subject_fingerprint=owner_fingerprint,
                    oauth_state="",
                )
                self._send(b"", HTTPStatus.SEE_OTHER, location="/picker")
                return
            if parsed.path == "/picker":
                if flow.get("stage") != "picker":
                    self._send(_start_page("Picker stageが無効です。"), HTTPStatus.CONFLICT)
                    return
                self._send(
                    _picker_page(
                        api_key=picker_api_key,
                        app_id=picker_app_id,
                        access_token=str(flow["access_token"]),
                    )
                )
                return
            self._send(_layout("Not found", "<h1>Not found</h1>"), HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:  # noqa: N802
            if self._reject_invalid_host():
                return
            form = self._read_form()
            if form is None:
                return
            path = urlparse(self.path).path
            if path == "/select":
                if flow.get("stage") != "picker":
                    self._send(_start_page("Picker stageが無効です。"), HTTPStatus.CONFLICT)
                    return
                folder_id = str((form.get("folder") or [""])[0])
                try:
                    folder_fingerprint = _verify_selected_production_folder(
                        str(flow["access_token"]),
                        folder_id,
                        approved_folder_fingerprint,
                    )
                except RuntimeError:
                    self._send(
                        _picker_page(
                            api_key=picker_api_key,
                            app_id=picker_app_id,
                            access_token=str(flow["access_token"]),
                            message=(
                                "選択folderが所有・共有可能・承認fingerprint条件を"
                                "満たしません。"
                            ),
                        ),
                        HTTPStatus.BAD_REQUEST,
                    )
                    return
                flow.update(
                    stage="confirmation",
                    folder_id=folder_id,
                    folder_fingerprint=folder_fingerprint,
                )
                self._send(_confirmation_page(folder_fingerprint))
                return
            if path == "/commit":
                if flow.get("stage") != "confirmation":
                    self._send(_start_page("最終確認stageが無効です。"), HTTPStatus.CONFLICT)
                    return
                confirmation = str((form.get("confirmation") or [""])[0])
                if not hmac.compare_digest(confirmation, EXACT_CONFIRMATION):
                    self._send(
                        _confirmation_page(str(flow["folder_fingerprint"])),
                        HTTPStatus.BAD_REQUEST,
                    )
                    return
                if not _transition(flow, "confirmation", "streaming"):
                    self._send(_start_page("最終確認stageが再利用されました。"), HTTPStatus.CONFLICT)
                    return
                records: tuple[SecretVersionRecord, ...] = ()
                status = "blocked"
                try:
                    current_fingerprint = _verify_selected_production_folder(
                        str(flow["access_token"]),
                        str(flow["folder_id"]),
                        approved_folder_fingerprint,
                    )
                    records = stream_secret_versions(
                        secret_sink,
                        {
                            "client_id": client_id,
                            "client_secret": client_secret,
                            "refresh_token": str(flow["refresh_token"]),
                            "folder_id": str(flow["folder_id"]),
                        },
                    )
                    status = "pass"
                except PartialSecretWriteError as error:
                    records = tuple(error.records)
                    current_fingerprint = str(flow["folder_fingerprint"])
                except RuntimeError:
                    current_fingerprint = str(flow["folder_fingerprint"])
                result = build_sanitized_result(
                    status=status,
                    owner_subject_fingerprint=str(
                        flow["owner_subject_fingerprint"]
                    ),
                    folder_fingerprint=current_fingerprint,
                    records=records,
                )
                outcome.status = status
                clear_sensitive_flow()
                flow["stage"] = "finished"
                self._send(_result_page(result))
                print(json.dumps(result, ensure_ascii=False, sort_keys=True))
                threading.Timer(3, self.server.shutdown).start()
                return
            self._send(_layout("Not found", "<h1>Not found</h1>"), HTTPStatus.NOT_FOUND)

        @classmethod
        def shutdown_cleanup(cls) -> None:
            clear_sensitive_flow()

    return Handler


def main() -> int:
    required = {
        "project_id": os.environ.get("PHASE7_PRODUCTION_GCP_PROJECT_ID", "").strip(),
        "client_id": os.environ.get("PHASE7_PRODUCTION_OAUTH_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("PHASE7_PRODUCTION_OAUTH_CLIENT_SECRET", "").strip(),
        "picker_api_key": os.environ.get("PHASE7_PRODUCTION_PICKER_API_KEY", "").strip(),
        "picker_app_id": os.environ.get("PHASE7_PRODUCTION_PICKER_APP_ID", "").strip(),
        "approved_folder_fingerprint": os.environ.get(
            "PHASE7_PRODUCTION_APPROVED_FOLDER_SHA256", ""
        ).strip(),
        "gcloud_executable": os.environ.get(
            "PHASE7_PRODUCTION_GCLOUD_EXECUTABLE", "gcloud"
        ).strip(),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print(f"Missing required process values: {', '.join(missing)}")
        return 2
    if SHA256_PATTERN.fullmatch(required["approved_folder_fingerprint"]) is None:
        print("Approved folder fingerprint must be a lowercase SHA-256 value.")
        return 2
    try:
        sink = GcloudSecretManagerSink(
            required["project_id"],
            executable=required["gcloud_executable"],
        )
        sink.assert_existing([secret_id for secret_id, _ in SECRET_VALUE_BINDINGS])
    except SecretSinkError:
        print("BLOCKED: required existing Secret Manager containers are unavailable.")
        return 3

    outcome = BootstrapOutcome()
    server = HTTPServer(
        (HOST, PORT),
        create_handler(
            client_id=required["client_id"],
            client_secret=required["client_secret"],
            picker_api_key=required["picker_api_key"],
            picker_app_id=required["picker_app_id"],
            approved_folder_fingerprint=required["approved_folder_fingerprint"],
            secret_sink=sink,
            outcome=outcome,
        ),
    )
    print(f"Open http://localhost:{PORT}/")
    print("No Drive permission mutation is implemented by this helper.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.RequestHandlerClass.shutdown_cleanup()
        server.server_close()
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
