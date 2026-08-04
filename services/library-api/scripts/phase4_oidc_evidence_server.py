from __future__ import annotations

import hashlib
import html
import json
import os
import secrets
import threading
from datetime import UTC, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 8765
MAX_REQUEST_BYTES = 20_000
TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def _claim_is_true(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).lower() == "true"


def build_evidence(
    claims: dict[str, Any],
    *,
    expected_client_id: str,
    expected_hd: str,
    role_label: str,
    now: datetime | None = None,
) -> dict[str, object]:
    captured_at = now or datetime.now(UTC)
    audience_match = claims.get("aud") == expected_client_id
    issuer_valid = claims.get("iss") in VALID_ISSUERS
    try:
        expires_at = datetime.fromtimestamp(int(claims["exp"]), tz=UTC)
        not_expired = expires_at > captured_at
        expires_at_text: str | None = expires_at.isoformat()
    except (KeyError, TypeError, ValueError, OSError):
        not_expired = False
        expires_at_text = None

    email_verified = _claim_is_true(claims.get("email_verified"))
    hosted_domain = str(claims.get("hd") or "").strip().lower()
    hosted_domain_present = bool(hosted_domain)
    normalized_expected_hd = expected_hd.strip().lower()
    expected_hd_match: bool | None = None
    if normalized_expected_hd:
        expected_hd_match = hosted_domain == normalized_expected_hd

    email = str(claims.get("email") or "").strip().lower()
    email_domain = email.rsplit("@", 1)[1] if "@" in email else ""
    subject = str(claims.get("sub") or "")
    subject_fingerprint = (
        hashlib.sha256(subject.encode("utf-8")).hexdigest()[:16]
        if subject
        else ""
    )

    passed = all(
        (
            audience_match,
            issuer_valid,
            not_expired,
            email_verified,
            hosted_domain_present,
            bool(subject_fingerprint),
            expected_hd_match is not False,
        )
    )

    return {
        "status": "pass" if passed else "blocked",
        "purpose": "phase4_evidence_only",
        "production_verifier": False,
        "captured_at_utc": captured_at.isoformat(),
        "role_label": role_label,
        "audience_match": audience_match,
        "issuer_valid": issuer_valid,
        "not_expired": not_expired,
        "expires_at_utc": expires_at_text,
        "email_verified": email_verified,
        "email_domain": email_domain,
        "hosted_domain_present": hosted_domain_present,
        "hosted_domain": hosted_domain or None,
        "expected_hd_match": expected_hd_match,
        "subject_fingerprint_sha256_16": subject_fingerprint or None,
    }


def verify_with_google(id_token: str) -> dict[str, Any]:
    query = urlencode({"id_token": id_token})
    request = Request(
        f"{TOKENINFO_ENDPOINT}?{query}",
        headers={"Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError("Google token verification failed.") from error
    if not isinstance(payload, dict) or payload.get("error_description"):
        raise ValueError("Google token verification failed.")
    return payload


def save_sanitized_evidence(
    evidence: dict[str, object],
    output_directory: str,
) -> Path | None:
    if not output_directory:
        return None
    directory = Path(output_directory).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    role = str(evidence["role_label"]).replace("/", "-").replace("\\", "-")
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output_path = directory / f"phase4-oidc-{role}-{timestamp}.json"
    output_path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    try:
        output_path.chmod(0o600)
    except OSError:
        pass
    return output_path


def build_page(client_id: str, csrf_token: str, role_label: str) -> bytes:
    safe_client_id = html.escape(client_id, quote=True)
    safe_csrf = html.escape(csrf_token, quote=True)
    safe_role = html.escape(role_label, quote=True)
    page = f"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Phase 4 Google OIDC証跡</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <style>
    body {{
      margin: 0;
      background: #f5f6f2;
      color: #0a1726;
      font-family: system-ui, sans-serif;
    }}
    main {{
      box-sizing: border-box;
      max-width: 720px;
      margin: 48px auto;
      padding: 32px;
      background: #fbfcfa;
      border: 1px solid #d9ded8;
      border-radius: 16px;
    }}
    pre {{
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      background: #eef2ef;
      padding: 16px;
      border-radius: 10px;
    }}
  </style>
</head>
<body>
  <main>
    <h1>Phase 4 Google OIDC証跡</h1>
    <p>対象: {safe_role}</p>
    <p>IDトークン、メール全文、Google subは画面・ファイルへ保存しません。</p>
    <div
      id="g_id_onload"
      data-client_id="{safe_client_id}"
      data-callback="handleCredentialResponse"
      data-auto_prompt="false">
    </div>
    <div class="g_id_signin" data-type="standard"></div>
    <h2>検証結果</h2>
    <pre id="result">Googleアカウントを選択してください。</pre>
  </main>
  <script>
    async function handleCredentialResponse(response) {{
      const result = document.getElementById("result");
      result.textContent = "Googleで検証中です。";
      try {{
        const verification = await fetch("/verify", {{
          method: "POST",
          headers: {{
            "Content-Type": "application/json",
            "X-Phase4-CSRF": "{safe_csrf}"
          }},
          body: JSON.stringify({{ credential: response.credential }})
        }});
        const payload = await verification.json();
        result.textContent = JSON.stringify(payload, null, 2);
      }} catch (_) {{
        result.textContent = JSON.stringify({{
          status: "error",
          code: "local_verification_failed"
        }}, null, 2);
      }}
    }}
  </script>
</body>
</html>
"""
    return page.encode("utf-8")


def create_handler(
    *,
    client_id: str,
    expected_hd: str,
    role_label: str,
    output_directory: str,
    csrf_token: str,
):
    page = build_page(client_id, csrf_token, role_label)

    class EvidenceHandler(BaseHTTPRequestHandler):
        server_version = "Phase4Evidence/1.0"

        def log_message(self, format: str, *args: object) -> None:
            return

        def _send_json(
            self,
            status: HTTPStatus,
            payload: dict[str, object],
        ) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if self.path != "/":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)

        def do_POST(self) -> None:
            if self.path != "/verify":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            if self.headers.get("X-Phase4-CSRF") != csrf_token:
                self._send_json(
                    HTTPStatus.FORBIDDEN,
                    {"status": "error", "code": "csrf_rejected"},
                )
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                content_length = 0
            if not 0 < content_length <= MAX_REQUEST_BYTES:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"status": "error", "code": "invalid_request_size"},
                )
                return
            try:
                request_payload = json.loads(
                    self.rfile.read(content_length).decode("utf-8")
                )
                credential = str(request_payload.get("credential") or "")
                if not credential:
                    raise ValueError("Credential missing.")
                claims = verify_with_google(credential)
                evidence = build_evidence(
                    claims,
                    expected_client_id=client_id,
                    expected_hd=expected_hd,
                    role_label=role_label,
                )
                output_path = save_sanitized_evidence(
                    evidence,
                    output_directory,
                )
                response = dict(evidence)
                response["saved"] = output_path is not None
                self._send_json(HTTPStatus.OK, response)
                print(
                    f"Evidence {evidence['status']} for role={role_label}; "
                    f"sanitized_file={output_path or 'not_saved'}"
                )
                threading.Thread(
                    target=self.server.shutdown,
                    daemon=True,
                ).start()
            except (ValueError, json.JSONDecodeError):
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {
                        "status": "error",
                        "code": "token_verification_failed",
                    },
                )

    return EvidenceHandler


def main() -> int:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    if not client_id:
        print("GOOGLE_OAUTH_CLIENT_ID is not configured.")
        return 2
    expected_hd = os.environ.get("EXPECTED_GOOGLE_HD", "").strip()
    role_label = os.environ.get("OIDC_EVIDENCE_ROLE", "workspace-member").strip()
    output_directory = os.environ.get("OIDC_EVIDENCE_OUTPUT_DIR", "").strip()
    csrf_token = secrets.token_urlsafe(32)
    server = ThreadingHTTPServer(
        (HOST, PORT),
        create_handler(
            client_id=client_id,
            expected_hd=expected_hd,
            role_label=role_label,
            output_directory=output_directory,
            csrf_token=csrf_token,
        ),
    )
    print(f"Open http://localhost:{PORT}/")
    print("Raw ID token, full email, and Google sub are not logged or saved.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
