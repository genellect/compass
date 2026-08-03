"""Historical OAuth succession drill.

The second-administrator requirement was superseded by ADR-0003 and the Phase
roadmap v3. This tool is not a current PASS or Production Gate requirement and
must only be run for a separately approved recovery drill.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import secrets
import threading
import time
from datetime import UTC, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

from scripts.phase4_oidc_evidence_server import build_evidence, verify_with_google


HOST = "127.0.0.1"
PORT = 8766
REDIRECT_URI = f"http://localhost:{PORT}/oauth2/callback"
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly"
SCOPES = ("openid", "email", DRIVE_SCOPE)
MAX_RESPONSE_BYTES = 100_000


def _read_json_response(response: Any) -> dict[str, Any]:
    body = response.read(MAX_RESPONSE_BYTES).decode("utf-8")
    payload = json.loads(body) if body else {}
    if not isinstance(payload, dict):
        raise ValueError("Unexpected JSON response.")
    return payload


def post_form(url: str, values: dict[str, str]) -> tuple[int, dict[str, Any]]:
    request = Request(
        url,
        data=urlencode(values).encode("ascii"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            return response.status, _read_json_response(response)
    except HTTPError as error:
        try:
            payload = _read_json_response(error)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            payload = {}
        return error.code, payload
    except (URLError, TimeoutError) as error:
        raise ValueError("Google OAuth endpoint unavailable.") from error


def exchange_authorization_code(
    code: str,
    *,
    client_id: str,
    client_secret: str,
) -> tuple[int, dict[str, Any]]:
    return post_form(
        TOKEN_ENDPOINT,
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )


def refresh_access_token(
    refresh_token: str,
    *,
    client_id: str,
    client_secret: str,
) -> tuple[int, dict[str, Any]]:
    return post_form(
        TOKEN_ENDPOINT,
        {
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
        },
    )


def revoke_token(token: str) -> int:
    status, _ = post_form(REVOKE_ENDPOINT, {"token": token})
    return status


def read_test_folder(access_token: str, folder_id: str) -> tuple[int, bool]:
    encoded_id = quote(folder_id, safe="")
    query = urlencode(
        {
            "fields": "id,mimeType,trashed",
            "supportsAllDrives": "true",
        }
    )
    request = Request(
        f"https://www.googleapis.com/drive/v3/files/{encoded_id}?{query}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = _read_json_response(response)
            is_folder = (
                payload.get("mimeType")
                == "application/vnd.google-apps.folder"
            )
            visible = response.status == HTTPStatus.OK and is_folder
            return response.status, visible
    except HTTPError as error:
        return error.code, False
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Google Drive API unavailable.") from error


def build_authorization_url(
    *,
    client_id: str,
    expected_hd: str,
    state: str,
) -> str:
    return f"{AUTHORIZATION_ENDPOINT}?{urlencode({
        'client_id': client_id,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent select_account',
        'state': state,
        'hd': expected_hd,
    })}"


def build_handoff_evidence(
    primary: dict[str, Any],
    secondary: dict[str, Any],
) -> dict[str, object]:
    primary_fingerprint = str(primary.get("subject_fingerprint_sha256_16") or "")
    secondary_fingerprint = str(
        secondary.get("subject_fingerprint_sha256_16") or ""
    )
    distinct_subjects = (
        bool(primary_fingerprint)
        and bool(secondary_fingerprint)
        and primary_fingerprint != secondary_fingerprint
    )
    primary_pass = primary.get("stage_status") == "pass"
    secondary_pass = secondary.get("stage_status") == "pass"
    passed = primary_pass and secondary_pass and distinct_subjects

    allowed_stage_keys = {
        "stage_status",
        "role_label",
        "captured_at_utc",
        "hosted_domain",
        "expected_hd_match",
        "subject_fingerprint_sha256_16",
        "token_exchange_http_status",
        "offline_refresh_token_present",
        "required_scope_granted",
        "drive_read_http_status",
        "drive_read_pass",
        "revoke_http_status",
        "refresh_after_revoke_http_status",
        "refresh_after_revoke_error_code",
        "old_credential_rejected",
        "stage_fingerprint_sha256_16",
    }

    def sanitized_stage(stage: dict[str, Any]) -> dict[str, Any]:
        return {key: stage[key] for key in allowed_stage_keys if key in stage}

    return {
        "status": "pass" if passed else "blocked",
        "purpose": "phase4_oauth_handoff_evidence_only",
        "production_credential": False,
        "captured_at_utc": datetime.now(UTC).isoformat(),
        "scope": DRIVE_SCOPE,
        "drive_permission_mutation_performed": False,
        "tokens_or_authorization_codes_persisted": False,
        "primary": sanitized_stage(primary),
        "secondary": sanitized_stage(secondary),
        "distinct_subjects": distinct_subjects,
        "production_credentials_retained": False,
    }


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def execute_actor_stage(
    actor: str,
    code: str,
    *,
    client_id: str,
    client_secret: str,
    expected_hd: str,
    folder_id: str,
) -> dict[str, object]:
    exchange_status, token_payload = exchange_authorization_code(
        code,
        client_id=client_id,
        client_secret=client_secret,
    )
    access_token = str(token_payload.get("access_token") or "")
    refresh_token = str(token_payload.get("refresh_token") or "")
    id_token = str(token_payload.get("id_token") or "")
    granted_scopes = set(str(token_payload.get("scope") or "").split())
    required_scope_granted = DRIVE_SCOPE in granted_scopes

    if exchange_status != HTTPStatus.OK or not all(
        (access_token, refresh_token, id_token)
    ):
        cleanup_revoke_status = revoke_token(refresh_token) if refresh_token else None
        return {
            "stage_status": "blocked",
            "role_label": f"{actor}-admin",
            "token_exchange_http_status": exchange_status,
            "offline_refresh_token_present": bool(refresh_token),
            "required_scope_granted": required_scope_granted,
            "cleanup_revoke_http_status": cleanup_revoke_status,
        }

    try:
        claims = verify_with_google(id_token)
        oidc = build_evidence(
            claims,
            expected_client_id=client_id,
            expected_hd=expected_hd,
            role_label=f"{actor}-admin",
        )
        drive_status, drive_read_pass = read_test_folder(access_token, folder_id)
    except ValueError:
        revoke_token(refresh_token)
        raise

    revoke_status = revoke_token(refresh_token)
    old_credential_rejected = False
    refresh_after_revoke_status: int | None = None
    refresh_after_revoke_error: str | None = None
    for attempt in range(3):
        if attempt:
            time.sleep(1)
        refresh_after_revoke_status, refresh_payload = refresh_access_token(
            refresh_token,
            client_id=client_id,
            client_secret=client_secret,
        )
        refresh_after_revoke_error = str(refresh_payload.get("error") or "") or None
        if (
            refresh_after_revoke_status == HTTPStatus.BAD_REQUEST
            and refresh_after_revoke_error == "invalid_grant"
        ):
            old_credential_rejected = True
            break

    stage_pass = all(
        (
            oidc.get("status") == "pass",
            exchange_status == HTTPStatus.OK,
            required_scope_granted,
            drive_read_pass,
            revoke_status == HTTPStatus.OK,
            old_credential_rejected,
        )
    )
    return {
        "stage_status": "pass" if stage_pass else "blocked",
        "role_label": f"{actor}-admin",
        "captured_at_utc": datetime.now(UTC).isoformat(),
        "hosted_domain": oidc.get("hosted_domain"),
        "expected_hd_match": oidc.get("expected_hd_match"),
        "subject_fingerprint_sha256_16": oidc.get(
            "subject_fingerprint_sha256_16"
        ),
        "token_exchange_http_status": exchange_status,
        "offline_refresh_token_present": True,
        "required_scope_granted": required_scope_granted,
        "drive_read_http_status": drive_status,
        "drive_read_pass": drive_read_pass,
        "revoke_http_status": revoke_status,
        "refresh_after_revoke_http_status": refresh_after_revoke_status,
        "refresh_after_revoke_error_code": refresh_after_revoke_error,
        "old_credential_rejected": old_credential_rejected,
        "stage_fingerprint_sha256_16": _fingerprint(
            f"{actor}:{oidc.get('subject_fingerprint_sha256_16')}:{drive_status}"
        ),
    }


def save_evidence(evidence: dict[str, object], output_directory: str) -> Path:
    directory = Path(output_directory).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = directory / f"phase4-oauth-handoff-{timestamp}.json"
    path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return path


def build_page(next_actor: str, message: str = "") -> bytes:
    actor_text = {
        "primary": "Primary administrator（現運営者）",
        "secondary": "Secondary administrator（第二管理者）",
        "complete": "完了",
    }[next_actor]
    action = ""
    if next_actor in {"primary", "secondary"}:
        action = (
            f'<a class="button" href="/authorize/{next_actor}">'
            f"{html.escape(actor_text)}でGoogle認証を開始</a>"
        )
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phase 4 OAuth引継ぎドリル</title>
<style>
body{{margin:0;background:#f5f6f2;color:#142133;font-family:system-ui,sans-serif}}
main{{max-width:760px;margin:48px auto;padding:32px;background:white;border-radius:16px}}
.button{{display:inline-block;margin-top:16px;padding:12px 18px;background:#174c3c;color:white;text-decoration:none;border-radius:8px}}
.notice{{padding:12px;background:#eef4f0;border-radius:8px}}
.warning{{padding:12px;background:#fff1d7;border:1px solid #d9a441;border-radius:8px}}
</style></head><body><main>
<h1>Phase 4 OAuth引継ぎドリル</h1>
<p class="warning">履歴用ツールです。第二管理者は現行のPASS/Production Gate要件ではありません。別途承認した復旧訓練以外では実行しないでください。</p>
<p class="notice">{html.escape(message or 'トークンは保存せず、空のテストフォルダのmetadataだけを読み取ります。')}</p>
<p>次の担当: {html.escape(actor_text)}</p>
{action}
<h2>安全境界</h2>
<ul><li>Drive権限の追加・変更・削除は行いません。</li>
<li>access token、refresh token、認可code、メール全文、Google subは保存しません。</li>
<li>各refresh tokenは試験内で失効します。</li></ul>
</main></body></html>""".encode("utf-8")


def create_handler(
    *,
    client_id: str,
    client_secret: str,
    expected_hd: str,
    folder_id: str,
    output_directory: str,
):
    state_lock = threading.Lock()
    flow_state: dict[str, Any] = {
        "next_actor": "primary",
        "oauth_states": {},
        "results": {},
        "message": "",
    }

    class HandoffHandler(BaseHTTPRequestHandler):
        server_version = "Phase4OAuthHandoff/1.0"

        def log_message(self, format: str, *args: object) -> None:
            return

        def _send_page(self) -> None:
            page = build_page(
                str(flow_state["next_actor"]),
                str(flow_state["message"]),
            )
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)

        def _redirect(self, location: str) -> None:
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", location)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/":
                self._send_page()
                return

            if parsed.path.startswith("/authorize/"):
                actor = parsed.path.rsplit("/", 1)[-1]
                with state_lock:
                    if actor not in {"primary", "secondary"} or actor != flow_state[
                        "next_actor"
                    ]:
                        self.send_error(HTTPStatus.CONFLICT)
                        return
                    csrf_state = secrets.token_urlsafe(32)
                    flow_state["oauth_states"][csrf_state] = actor
                self._redirect(
                    build_authorization_url(
                        client_id=client_id,
                        expected_hd=expected_hd,
                        state=csrf_state,
                    )
                )
                return

            if parsed.path != "/oauth2/callback":
                self.send_error(HTTPStatus.NOT_FOUND)
                return

            query = parse_qs(parsed.query)
            state_value = str(query.get("state", [""])[0])
            code = str(query.get("code", [""])[0])
            oauth_error = str(query.get("error", [""])[0])
            with state_lock:
                actor = flow_state["oauth_states"].pop(state_value, None)
            if not actor or oauth_error or not code:
                flow_state["message"] = "Google認証が完了しませんでした。最初から再試行してください。"
                self._redirect("/")
                return

            try:
                result = execute_actor_stage(
                    actor,
                    code,
                    client_id=client_id,
                    client_secret=client_secret,
                    expected_hd=expected_hd,
                    folder_id=folder_id,
                )
            except ValueError:
                flow_state["message"] = "Google API検証に失敗しました。設定を確認して再試行してください。"
                self._redirect("/")
                return

            flow_state["results"][actor] = result
            if result.get("stage_status") != "pass":
                flow_state["message"] = f"{actor}の証跡がBLOCKEDです。保存されたtokenはありません。"
                self._redirect("/")
                return

            if actor == "primary":
                flow_state["next_actor"] = "secondary"
                flow_state["message"] = (
                    "Primaryの失効確認がPASSしました。別人物の第二管理者で続行してください。"
                )
                self._redirect("/")
                return

            final_evidence = build_handoff_evidence(
                flow_state["results"]["primary"],
                flow_state["results"]["secondary"],
            )
            output_path = save_evidence(final_evidence, output_directory)
            flow_state["next_actor"] = "complete"
            flow_state["message"] = (
                f"ドリル結果: {str(final_evidence['status']).upper()}。"
                "証跡ファイルを保存しました。"
            )
            print(
                f"OAuth handoff {final_evidence['status']}; "
                f"sanitized_file={output_path}"
            )
            self._redirect("/")
            threading.Timer(3, self.server.shutdown).start()

    return HandoffHandler


def main() -> int:
    required = {
        "client_id": os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip(),
        "expected_hd": os.environ.get("EXPECTED_GOOGLE_HD", "").strip(),
        "folder_id": os.environ.get("PHASE4_DRIVE_TEST_FOLDER_ID", "").strip(),
        "output_directory": os.environ.get(
            "PHASE4_OAUTH_HANDOFF_OUTPUT_DIR", ""
        ).strip(),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print(f"Missing required local environment values: {', '.join(missing)}")
        return 2

    server = ThreadingHTTPServer(
        (HOST, PORT),
        create_handler(**required),
    )
    print(f"Open http://localhost:{PORT}/")
    print("Raw tokens, authorization codes, full email, and Google sub are not saved.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
