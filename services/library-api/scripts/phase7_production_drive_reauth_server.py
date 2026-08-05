"""Re-authorize the pinned production Drive owner credential.

The helper reads the existing OAuth client and Drive folder from Secret
Manager, asks the owner for a fresh offline grant, verifies the exact pinned
folder is still owned and shareable, and adds only a new refresh-token version.
No credential or Drive ID is written to disk or printed.
"""

from __future__ import annotations

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
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import requests

from app.drive_client import DRIVE_SCOPE
from scripts.phase7_production_drive_bootstrap_server import (
    GcloudSecretManagerSink,
    SecretSinkError,
    _verify_id_token,
    _verify_selected_production_folder,
)


HOST = "127.0.0.1"
PORT = 8769
REDIRECT_URI = f"http://localhost:{PORT}/oauth2/callback"
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
SCOPES = ("openid", "email", DRIVE_SCOPE)
PROJECT_ID_PATTERN = re.compile(r"[a-z][a-z0-9-]{4,28}[a-z0-9]")
SECRET_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,255}")
CLIENT_ID_SECRET = "fsl-drive-oauth-client-id"
CLIENT_SECRET_SECRET = "fsl-drive-oauth-client-secret"
REFRESH_TOKEN_SECRET = "fsl-drive-oauth-refresh-token"
FOLDER_ID_SECRET = "fsl-drive-resource-id"


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _read_secret(executable: str, project_id: str, secret_id: str) -> str:
    if SECRET_ID_PATTERN.fullmatch(secret_id) is None:
        raise RuntimeError("Secret ID is invalid.")
    try:
        result = subprocess.run(
            [
                executable,
                "secrets",
                "versions",
                "access",
                "latest",
                f"--secret={secret_id}",
                f"--project={project_id}",
                "--quiet",
            ],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError("Secret Manager read failed.") from error
    value = result.stdout.strip()
    if result.returncode != 0 or not value:
        raise RuntimeError("A required Secret Manager value is unavailable.")
    return value


def _refresh_gcloud_adc_access_token(executable: str) -> str:
    """Return a fresh ADC token without reusing the gcloud token override."""

    environment = os.environ.copy()
    environment.pop("CLOUDSDK_AUTH_ACCESS_TOKEN", None)
    try:
        result = subprocess.run(
            [
                executable,
                "auth",
                "application-default",
                "print-access-token",
            ],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
            env=environment,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError("ADC token refresh failed.") from error
    access_token = result.stdout.strip()
    if result.returncode != 0 or not access_token or any(
        character.isspace() for character in access_token
    ):
        raise RuntimeError("ADC token refresh failed.")
    return access_token


def _add_refresh_token_version_with_fresh_adc(
    sink: GcloudSecretManagerSink,
    executable: str,
    refresh_token: str,
) -> int:
    """Refresh gcloud authorization immediately before the secret write."""

    adc_access_token = _refresh_gcloud_adc_access_token(executable)
    previous_access_token = os.environ.get("CLOUDSDK_AUTH_ACCESS_TOKEN")
    os.environ["CLOUDSDK_AUTH_ACCESS_TOKEN"] = adc_access_token
    try:
        return sink.add_version(REFRESH_TOKEN_SECRET, refresh_token)
    finally:
        if previous_access_token is None:
            os.environ.pop("CLOUDSDK_AUTH_ACCESS_TOKEN", None)
        else:
            os.environ["CLOUDSDK_AUTH_ACCESS_TOKEN"] = previous_access_token
        adc_access_token = ""


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


def _exchange_code(code: str, client_id: str, client_secret: str) -> dict[str, Any]:
    try:
        response = requests.post(
            TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        raise RuntimeError("OAuth code exchange failed.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("OAuth returned an invalid response.")
    return payload


def _verify_drive_scope(access_token: str) -> None:
    try:
        response = requests.get(
            TOKENINFO_ENDPOINT,
            params={"access_token": access_token},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        raise RuntimeError("OAuth scope verification failed.") from error
    scopes = set(str(payload.get("scope") or "").split())
    if DRIVE_SCOPE not in scopes:
        raise RuntimeError("The required Drive scope was not granted.")


def _page(title: str, body: str) -> bytes:
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>{html.escape(title)}</title>
<style>body{{margin:0;background:#f2f5f0;color:#142133;font-family:system-ui,sans-serif}}
main{{max-width:720px;margin:48px auto;padding:32px;background:#fff;border-radius:18px}}
a{{display:inline-block;border-radius:9px;padding:12px 18px;background:#174c3c;color:#fff;
text-decoration:none}}code{{overflow-wrap:anywhere}}</style></head>
<body><main>{body}</main></body></html>""".encode("utf-8")


def main() -> int:
    project_id = os.environ.get("PHASE7_PRODUCTION_GCP_PROJECT_ID", "").strip()
    executable = os.environ.get("PHASE7_PRODUCTION_GCLOUD_EXECUTABLE", "gcloud").strip()
    if PROJECT_ID_PATTERN.fullmatch(project_id) is None or not executable:
        print("BLOCKED: production re-authorization configuration is invalid.")
        return 2

    try:
        client_id = _read_secret(executable, project_id, CLIENT_ID_SECRET)
        client_secret = _read_secret(executable, project_id, CLIENT_SECRET_SECRET)
        folder_id = _read_secret(executable, project_id, FOLDER_ID_SECRET)
        sink = GcloudSecretManagerSink(project_id, executable=executable)
        sink.assert_existing([REFRESH_TOKEN_SECRET])
    except (RuntimeError, SecretSinkError):
        print("BLOCKED: existing production secrets are unavailable.")
        return 3

    state = secrets.token_urlsafe(32)
    outcome = {"status": "blocked"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *_args: object) -> None:
            return

        def send_page(
            self,
            content: bytes,
            status: HTTPStatus = HTTPStatus.OK,
            *,
            location: str | None = None,
        ) -> None:
            self.send_response(status)
            if location:
                self.send_header("Location", location)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            if content:
                self.wfile.write(content)

        def do_GET(self) -> None:  # noqa: N802
            if self.headers.get("Host", "").lower() not in {
                f"localhost:{PORT}",
                f"127.0.0.1:{PORT}",
            }:
                self.send_page(_page("Rejected", "<h1>Invalid loopback host</h1>"), HTTPStatus.MISDIRECTED_REQUEST)
                return
            parsed = urlparse(self.path)
            if parsed.path == "/":
                self.send_page(
                    _page(
                        "Production Drive authorization",
                        "<h1>Production Drive authorization</h1>"
                        "<p>承認済みフォルダの所有者アカウントで続行してください。</p>"
                        "<p>新しい認証情報はSecret Managerへ直接保存され、端末には保存されません。</p>"
                        '<a href="/authorize">Googleで続行</a>',
                    )
                )
                return
            if parsed.path == "/authorize":
                self.send_page(b"", HTTPStatus.SEE_OTHER, location=_authorization_url(client_id, state))
                return
            if parsed.path != "/oauth2/callback":
                self.send_page(_page("Not found", "<h1>Not found</h1>"), HTTPStatus.NOT_FOUND)
                return

            query = parse_qs(parsed.query)
            returned_state = str((query.get("state") or [""])[0])
            code = str((query.get("code") or [""])[0])
            if not code or not hmac.compare_digest(returned_state, state):
                self.send_page(_page("Blocked", "<h1>認証を確認できませんでした。</h1>"), HTTPStatus.BAD_REQUEST)
                return
            stage = "oauth_code_exchange"
            try:
                tokens = _exchange_code(code, client_id, client_secret)
                access_token = str(tokens.get("access_token") or "")
                refresh_token = str(tokens.get("refresh_token") or "")
                id_token = str(tokens.get("id_token") or "")
                if not access_token or not refresh_token or not id_token:
                    raise RuntimeError("Offline OAuth credentials are incomplete.")
                stage = "owner_identity_verification"
                owner_fingerprint = _verify_id_token(id_token, client_id)
                stage = "drive_scope_verification"
                _verify_drive_scope(access_token)
                folder_fingerprint = _fingerprint(folder_id)
                stage = "pinned_folder_verification"
                _verify_selected_production_folder(
                    access_token,
                    folder_id,
                    folder_fingerprint,
                )
                stage = "secret_version_write"
                version = _add_refresh_token_version_with_fresh_adc(
                    sink,
                    executable,
                    refresh_token,
                )
            except (RuntimeError, SecretSinkError):
                print(
                    json.dumps(
                        {
                            "status": "blocked",
                            "purpose": "production_drive_scope_reauthorization",
                            "failed_stage": stage,
                        },
                        ensure_ascii=True,
                        sort_keys=True,
                    )
                )
                self.send_page(
                    _page("Blocked", "<h1>本番Drive認証を更新できませんでした。</h1>"),
                    HTTPStatus.BAD_REQUEST,
                )
                threading.Timer(2, self.server.shutdown).start()
                return

            result = {
                "status": "pass",
                "purpose": "production_drive_scope_reauthorization",
                "captured_at_utc": datetime.now(UTC).isoformat(),
                "owner_subject_fingerprint_sha256_16": owner_fingerprint,
                "folder_fingerprint_sha256_16": folder_fingerprint[:16],
                "refresh_token_secret_version": version,
                "scope": DRIVE_SCOPE,
                "raw_credentials_or_drive_ids_persisted_locally": False,
            }
            outcome["status"] = "pass"
            self.send_page(_page("Complete", "<h1>Drive認証を更新しました。</h1><p>この画面は閉じて構いません。</p>"))
            print(json.dumps(result, ensure_ascii=True, sort_keys=True))
            threading.Timer(2, self.server.shutdown).start()

    print(f"Open http://localhost:{PORT}/")
    server = HTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        client_secret = ""
        folder_id = ""
    return 0 if outcome["status"] == "pass" else 4


if __name__ == "__main__":
    raise SystemExit(main())
