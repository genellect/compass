from functools import lru_cache
from hashlib import sha256
import hmac
import re
import unicodedata
from urllib.parse import parse_qs, urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PRODUCTION_DRIVE_ACTIVATION_CONFIRMATION = (
    "I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1"
)
PRODUCTION_NOTIFICATION_ACTIVATION_CONFIRMATION = (
    "I_APPROVED_PRODUCTION_GAS_EMAIL_NOTIFICATIONS_V1"
)
PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION = (
    "I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1"
)
PRODUCTION_ADMIN_MUTATIONS_ACTIVATION_CONFIRMATION = (
    "I_APPROVED_PRODUCTION_ADMIN_MUTATIONS_AFTER_MFA_AND_RECOVERY_REVIEW_V1"
)
PRODUCTION_API_WRITES_ACTIVATION_CONFIRMATION = (
    "I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1"
)
PRODUCTION_EXPORT_ACTIVATION_CONFIRMATION = (
    "I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1"
)
NOTIFICATION_HMAC_CONTEXT = b"fsl-mailapp-notification-v1"


def derive_notification_hmac_key(root_key: str) -> bytes:
    """Derive a notification-only key without exposing the attestation root."""
    return hmac.new(
        root_key.encode("utf-8"),
        NOTIFICATION_HMAC_CONTEXT,
        sha256,
    ).digest()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    service_surface: str = "local-composite"
    database_url: str = "sqlite+pysqlite:///./phase5-local.db"
    database_url_unpooled: str | None = None
    runtime_database_role: str = ""
    # Production public is execute-only. ORM access remains available for
    # local/SQLite gates but is never a production fallback.
    public_database_access_mode: str = "orm"
    public_registration_rpc_key_version: str = "v1"
    public_registration_rpc_token: str = Field(
        default="",
        max_length=512,
    )
    db_pool_size: int = Field(default=2, ge=1, le=10)
    db_max_overflow: int = Field(default=0, ge=0, le=10)
    db_pool_timeout_seconds: int = Field(default=5, ge=1, le=60)
    db_pool_recycle_seconds: int = Field(default=240, ge=30, le=3600)
    db_statement_timeout_seconds: int = Field(default=10, ge=1, le=120)
    pii_logging_enabled: bool = False
    external_side_effects_enabled: bool = False
    # Local-only persistence routes are opt-in. Production must never inherit
    # the SQLite/local registration surface by omission.
    phase5_local_api_enabled: bool = False
    phase6_auth_api_enabled: bool = False
    google_oauth_client_ids: str = ""
    google_oauth_client_id: str = ""
    google_admin_oauth_client_ids: str = ""
    google_admin_oauth_client_id: str = ""
    google_admin_allowed_emails: str = ""
    library_admin_edge_shared_secret: str = Field(
        default="",
        max_length=512,
    )
    allowed_google_hosted_domains: str = ""
    cors_allowed_origins: str = (
        "http://127.0.0.1:3000,http://localhost:3000"
    )
    google_id_token_max_chars: int = Field(
        default=8192,
        ge=1024,
        le=32768,
    )
    max_request_body_bytes: int = Field(default=16384, ge=4096, le=65536)
    preauth_rate_limit_per_minute: int = Field(default=120, ge=10, le=1000)
    admin_preauth_rate_limit_per_minute: int = Field(
        default=30,
        ge=1,
        le=120,
    )
    submit_rate_limit_per_hour: int = Field(default=5, ge=1, le=100)
    submit_global_rate_limit_per_minute: int = Field(default=30, ge=5, le=500)
    status_rate_limit_per_five_minutes: int = Field(default=30, ge=5, le=500)
    rate_limits_enabled: bool = False
    structured_logging_enabled: bool = True
    api_read_only_mode: bool = False
    api_writes_activation_confirmation: str = ""
    terms_version: str = "phase3-draft-2026-07-16"
    privacy_version: str = "phase3-draft-2026-07-16"
    terms_content_sha256: str = ""
    privacy_content_sha256: str = ""
    # The actual Drive ID is worker-only. Public/admin producers use a fixed
    # logical target alias from drive_attestation.py and must receive no ID.
    drive_resource_id: str = ""
    drive_operation_attestation_key: str = Field(
        default="local-synthetic-drive-operation-attestation-key-v1",
        max_length=512,
    )
    drive_operation_attestation_ttl_seconds: int = Field(
        default=3600,
        ge=300,
        le=86400,
    )
    phase7_worker_api_enabled: bool = False
    phase7_drive_api_enabled: bool = False
    phase7_drive_kill_switch: bool = True
    phase7_drive_activation_confirmation: str = ""
    phase7_notification_delivery_enabled: bool = False
    phase7_notification_kill_switch: bool = True
    phase7_notification_activation_confirmation: str = ""
    gas_notification_webhook_url: str = ""
    phase7_worker_secret: str = ""
    worker_auth_mode: str = "shared_secret"
    worker_oidc_audience: str = ""
    worker_invoker_service_account: str = ""
    phase8_admin_api_enabled: bool = False
    phase8_admin_activation_confirmation: str = ""
    admin_mutations_enabled: bool = False
    admin_mutations_activation_confirmation: str = ""
    phase10a_export_api_enabled: bool = False
    phase10a_export_activation_confirmation: str = ""
    phase10a_export_max_rows: int = Field(default=5_000, ge=1, le=5_000)
    phase10a_export_max_bytes: int = Field(
        default=10_485_760,
        ge=1_048_576,
        le=52_428_800,
    )
    phase10a_export_rate_limit_per_hour: int = Field(
        default=12,
        ge=1,
        le=100,
    )
    phase10a_download_retention_days: int = Field(default=30, ge=1, le=90)
    phase7_operation_lease_seconds: int = Field(default=60, ge=15, le=600)
    phase7_resource_lease_seconds: int = Field(default=60, ge=15, le=600)
    phase7_retry_base_seconds: int = Field(default=30, ge=1, le=3600)
    notification_operation_lease_seconds: int = Field(
        default=60,
        ge=15,
        le=600,
    )
    notification_retry_base_seconds: int = Field(
        default=30,
        ge=1,
        le=3600,
    )
    notification_request_timeout_seconds: int = Field(
        default=8,
        ge=2,
        le=15,
    )
    notification_worker_time_budget_seconds: int = Field(
        default=20,
        ge=5,
        le=60,
    )
    worker_batch_size: int = Field(default=20, ge=1, le=20)
    worker_time_budget_seconds: int = Field(default=45, ge=5, le=110)
    drive_request_timeout_seconds: int = Field(default=20, ge=3, le=120)
    google_drive_oauth_client_id: str = ""
    google_drive_oauth_client_secret: str = ""
    google_drive_oauth_refresh_token: str = ""
    google_drive_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_drive_api_base_url: str = "https://www.googleapis.com/drive/v3"

    @property
    def migration_database_url(self) -> str:
        return self.database_url_unpooled or self.database_url

    @staticmethod
    def _csv_values(value: str) -> tuple[str, ...]:
        return tuple(
            item.strip()
            for item in value.split(",")
            if item.strip()
        )

    @property
    def google_oauth_client_id_list(self) -> tuple[str, ...]:
        configured = self._csv_values(self.google_oauth_client_ids)
        return configured or self._csv_values(self.google_oauth_client_id)

    @property
    def google_admin_oauth_client_id_list(self) -> tuple[str, ...]:
        configured = self._csv_values(self.google_admin_oauth_client_ids)
        return configured or self._csv_values(
            self.google_admin_oauth_client_id
        )

    @property
    def google_admin_allowed_email_list(self) -> tuple[str, ...]:
        return tuple(
            unicodedata.normalize("NFKC", value).strip().lower()
            for value in self._csv_values(self.google_admin_allowed_emails)
        )

    @property
    def allowed_google_hosted_domain_list(self) -> tuple[str, ...]:
        return tuple(
            value.lower()
            for value in self._csv_values(
                self.allowed_google_hosted_domains
            )
        )

    @property
    def cors_allowed_origin_list(self) -> tuple[str, ...]:
        return self._csv_values(self.cors_allowed_origins)

    def validate_phase6_configuration(self) -> None:
        if not self.google_oauth_client_id_list:
            raise ValueError("Google OAuth client ID is not configured.")
        if not self.allowed_google_hosted_domain_list:
            raise ValueError("Allowed Google hosted domain is not configured.")

    def validate_admin_oauth_configuration(self) -> None:
        if not self.google_admin_oauth_client_id_list:
            raise ValueError("Admin Google OAuth client ID is not configured.")
        allowed_emails = self.google_admin_allowed_email_list
        if not allowed_emails:
            raise ValueError("Admin Google email allowlist is not configured.")
        if len(set(allowed_emails)) != len(allowed_emails):
            raise ValueError("Admin Google email allowlist contains duplicates.")
        if any(
            len(value) > 320
            or re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is None
            for value in allowed_emails
        ):
            raise ValueError("Admin Google email allowlist is invalid.")

    def validate_no_admin_configuration(self, *, surface: str) -> None:
        if (
            self.phase8_admin_api_enabled
            or self.admin_mutations_enabled
            or self.phase10a_export_api_enabled
            or any(
                value.strip()
                for value in (
                    self.google_admin_oauth_client_ids,
                    self.google_admin_oauth_client_id,
                    self.google_admin_allowed_emails,
                    self.library_admin_edge_shared_secret,
                    self.phase8_admin_activation_confirmation,
                    self.admin_mutations_activation_confirmation,
                    self.phase10a_export_activation_confirmation,
                )
            )
        ):
            raise ValueError(
                f"Production {surface} surface must not receive administrator "
                "configuration."
            )

    def validate_no_notification_configuration(self, *, surface: str) -> None:
        if (
            self.phase7_notification_delivery_enabled
            or not self.phase7_notification_kill_switch
            or self.phase7_notification_activation_confirmation.strip()
            or self.gas_notification_webhook_url.strip()
        ):
            raise ValueError(
                f"Production {surface} surface must not receive notification "
                "configuration."
            )

    def validate_phase7_worker_boundary(self) -> None:
        if not self.phase7_worker_api_enabled:
            raise ValueError("Phase 7 worker API is disabled.")
        if (
            self.worker_auth_mode != "cloud_run_oidc"
            and len(self.phase7_worker_secret) < 32
        ):
            raise ValueError("Phase 7 worker secret is not configured.")
        if not self.external_side_effects_enabled:
            raise ValueError("External side effects are disabled.")
        if not self.phase7_drive_api_enabled:
            raise ValueError("Phase 7 Drive API is disabled.")
        if self.phase7_drive_kill_switch:
            raise ValueError("Phase 7 Drive kill switch is active.")
        if (
            self.app_env.lower() == "production"
            and self.phase7_drive_activation_confirmation
            != PRODUCTION_DRIVE_ACTIVATION_CONFIRMATION
        ):
            raise ValueError(
                "Production Drive activation confirmation is missing."
            )

    def validate_phase7_google_drive_configuration(self) -> None:
        required = (
            self.google_drive_oauth_client_id,
            self.google_drive_oauth_client_secret,
            self.google_drive_oauth_refresh_token,
            self.drive_resource_id,
        )
        if not all(value.strip() for value in required):
            raise ValueError("Google Drive OAuth is not configured.")

    def validate_phase7_notification_configuration(self) -> None:
        parsed = urlparse(self.gas_notification_webhook_url)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("GAS notification webhook URL is invalid.")
        if self.app_env.lower() == "production" and (
            parsed.hostname != "script.google.com"
            or not parsed.path.startswith("/macros/s/")
            or not parsed.path.endswith("/exec")
        ):
            raise ValueError("Production GAS notification webhook is invalid.")
        root_key = self.drive_operation_attestation_key
        if len(root_key.encode("utf-8")) < 32:
            raise ValueError("Notification signing root is not configured.")
        derived_key = derive_notification_hmac_key(root_key)
        if len(derived_key) != 32 or hmac.compare_digest(
            derived_key,
            root_key.encode("utf-8"),
        ):
            raise ValueError("Notification signing key separation failed.")

    def validate_phase7_notification_boundary(self) -> None:
        if not self.phase7_notification_delivery_enabled:
            raise ValueError("Notification delivery is disabled.")
        if self.phase7_notification_kill_switch:
            raise ValueError("Notification delivery kill switch is active.")
        if not self.external_side_effects_enabled:
            raise ValueError("External side effects are disabled.")
        if not self.phase7_worker_api_enabled or not self.phase7_drive_api_enabled:
            raise ValueError("Drive worker must be active before notification delivery.")
        if self.phase7_drive_kill_switch:
            raise ValueError("Drive worker kill switch is active.")
        if (
            self.app_env.lower() == "production"
            and self.phase7_notification_activation_confirmation
            != PRODUCTION_NOTIFICATION_ACTIVATION_CONFIRMATION
        ):
            raise ValueError(
                "Production notification activation confirmation is missing."
            )
        self.validate_phase7_notification_configuration()

    def validate_drive_operation_attestation_configuration(self) -> None:
        key = self.drive_operation_attestation_key
        if (
            len(key.encode("utf-8")) < 32
            or len(key) > 512
            or not key.strip()
            or key.lower().startswith(("local", "phase", "synthetic"))
        ):
            raise ValueError(
                "Production Drive operation attestation key is not configured."
            )
        forbidden_reuse = {
            self.library_admin_edge_shared_secret,
            self.phase7_worker_secret,
            self.google_drive_oauth_client_id,
            self.google_drive_oauth_client_secret,
            self.google_drive_oauth_refresh_token,
        }
        if key in {value for value in forbidden_reuse if value}:
            raise ValueError(
                "Drive operation attestation key must be a dedicated secret."
            )

    def validate_for_service(self, surface: str | None = None) -> None:
        active_surface = surface or self.service_surface
        if active_surface not in {
            "local-composite",
            "public",
            "admin",
            "worker",
            "migration",
        }:
            raise ValueError("Unknown service surface.")
        if self.pii_logging_enabled:
            raise ValueError("PII logging must remain disabled.")
        if self.app_env.lower() != "production":
            return
        if surface is not None and self.service_surface != active_surface:
            raise ValueError("Configured service surface does not match entrypoint.")
        if active_surface in {"public", "admin", "worker"} and not self.rate_limits_enabled:
            raise ValueError("Production rate limits must be enabled.")
        if active_surface in {"public", "admin", "worker"}:
            self.validate_drive_operation_attestation_configuration()
        if (
            active_surface == "admin"
            and self.phase8_admin_api_enabled
            and not 1 <= self.admin_preauth_rate_limit_per_minute <= 120
        ):
            # Keep this explicit even though normal Settings construction also
            # applies the Field bounds. model_copy/update-based deployment
            # tooling must not be able to bypass the production guardrail.
            raise ValueError(
                "Production admin pre-auth rate limit must be between 1 and "
                "120 requests per minute."
            )
        if active_surface == "admin" and self.phase8_admin_api_enabled:
            edge_secret = self.library_admin_edge_shared_secret
            if (
                len(edge_secret) < 32
                or len(edge_secret) > 512
                or not edge_secret.strip()
            ):
                raise ValueError(
                    "Production administrator edge boundary is not configured."
                )
        if active_surface == "local-composite":
            raise ValueError("The composite application is forbidden in production.")
        if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise ValueError("Production requires PostgreSQL.")
        if parse_qs(urlparse(self.database_url).query).get("sslmode") != [
            "require"
        ]:
            raise ValueError("Production database connections require TLS.")

        if active_surface in {"public", "admin", "worker"}:
            if "-pooler." not in self.database_url:
                raise ValueError("Runtime services require the pooled Neon URL.")
            if self.database_url_unpooled:
                raise ValueError("Runtime services must not receive a direct database URL.")
            runtime_role = self.runtime_database_role.strip().lower()
            if not runtime_role:
                raise ValueError(
                    "Production runtime database role is required."
                )
            if re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", runtime_role) is None:
                raise ValueError(
                    "Production runtime database role name is invalid."
                )
            if (
                runtime_role in {"postgres", "root"}
                or any(
                    fragment in runtime_role
                    for fragment in ("owner", "admin", "superuser")
                )
            ):
                raise ValueError(
                    "Production runtime database role must not be an owner role."
                )

        if active_surface == "migration":
            if not self.database_url_unpooled:
                raise ValueError("Migration requires a direct database URL.")
            if "-pooler." in self.database_url_unpooled:
                raise ValueError("Migration direct URL must not use the pooler.")
            if parse_qs(urlparse(self.database_url_unpooled).query).get(
                "sslmode"
            ) != ["require"]:
                raise ValueError("Migration direct connection requires TLS.")
            if re.fullmatch(
                r"v[1-9][0-9]*",
                self.public_registration_rpc_key_version,
            ) is None:
                raise ValueError("Migration public RPC key version is invalid.")
            rpc_token_bytes = self.public_registration_rpc_token.encode(
                "utf-8"
            )
            if not 32 <= len(rpc_token_bytes) <= 512:
                raise ValueError(
                    "Migration public RPC token is not configured."
                )

        if active_surface == "public":
            self.validate_no_admin_configuration(surface="public")
            self.validate_no_notification_configuration(surface="public")
            if self.public_database_access_mode != "rpc_v1":
                raise ValueError(
                    "Production public database access mode must be rpc_v1."
                )
            if re.fullmatch(
                r"v[1-9][0-9]*",
                self.public_registration_rpc_key_version,
            ) is None:
                raise ValueError(
                    "Production public RPC key version is invalid."
                )
            rpc_token = self.public_registration_rpc_token
            if (
                len(rpc_token.encode("utf-8")) < 32
                or len(rpc_token.encode("utf-8")) > 512
                or not rpc_token.strip()
            ):
                raise ValueError(
                    "Production public RPC token is not configured."
                )
            forbidden_rpc_token_reuse = {
                self.drive_operation_attestation_key,
                self.library_admin_edge_shared_secret,
                self.phase7_worker_secret,
                self.google_drive_oauth_client_secret,
                self.google_drive_oauth_refresh_token,
            }
            if rpc_token in {
                value for value in forbidden_rpc_token_reuse if value
            }:
                raise ValueError(
                    "Production public RPC token must be an independent secret."
                )
            self.validate_phase6_configuration()
            if self.allowed_google_hosted_domain_list != (
                "st.kitasato-u.ac.jp",
            ):
                raise ValueError("Production hosted-domain boundary is invalid.")
            if self.phase5_local_api_enabled:
                raise ValueError("Local API must be disabled in production.")
            if not self.phase6_auth_api_enabled:
                raise ValueError("Public authentication API is disabled.")
            if self.api_read_only_mode:
                if self.api_writes_activation_confirmation.strip():
                    raise ValueError(
                        "Production API write confirmation must be empty "
                        "while read-only mode is active."
                    )
            elif (
                self.api_writes_activation_confirmation
                != PRODUCTION_API_WRITES_ACTIVATION_CONFIRMATION
            ):
                raise ValueError(
                    "Production API write activation confirmation is missing."
                )
            consent_values = (
                self.terms_version,
                self.privacy_version,
                self.terms_content_sha256,
                self.privacy_content_sha256,
            )
            if (
                any(not value.strip() for value in consent_values)
                or "draft" in self.terms_version.lower()
                or "draft" in self.privacy_version.lower()
                or len(self.terms_content_sha256) != 64
                or len(self.privacy_content_sha256) != 64
                or re.fullmatch(
                    r"[0-9a-f]{64}", self.terms_content_sha256
                )
                is None
                or re.fullmatch(
                    r"[0-9a-f]{64}", self.privacy_content_sha256
                )
                is None
            ):
                raise ValueError(
                    "Approved terms/privacy versions and hashes are required."
                )
            if self.external_side_effects_enabled or self.phase7_worker_api_enabled:
                raise ValueError("Public API must not execute worker side effects.")
            if not self.cors_allowed_origin_list:
                raise ValueError("Production CORS origin is not configured.")
            for origin in self.cors_allowed_origin_list:
                parsed = urlparse(origin)
                if (
                    parsed.scheme != "https"
                    or not parsed.netloc
                    or "*" in origin
                    or parsed.hostname in {"localhost", "127.0.0.1"}
                ):
                    raise ValueError("Production CORS origins must be exact HTTPS origins.")
            if any(
                (
                    self.google_drive_oauth_client_id,
                    self.google_drive_oauth_client_secret,
                    self.google_drive_oauth_refresh_token,
                )
            ):
                raise ValueError("Public API must not receive Drive OAuth secrets.")
            if self.drive_resource_id.strip():
                raise ValueError("Public API must not receive the Drive resource ID.")

        if active_surface == "admin":
            self.validate_no_notification_configuration(surface="admin")
            if self.phase5_local_api_enabled:
                raise ValueError("Local API must be disabled in production.")
            if self.phase6_auth_api_enabled:
                raise ValueError(
                    "Admin surface must not enable the public authentication API."
                )
            if not self.phase8_admin_api_enabled:
                raise ValueError("Production admin API is disabled.")
            if (
                self.phase8_admin_activation_confirmation
                != PRODUCTION_ADMIN_ACTIVATION_CONFIRMATION
            ):
                raise ValueError(
                    "Production admin activation confirmation is missing."
                )
            self.validate_admin_oauth_configuration()
            if self.google_oauth_client_id_list:
                raise ValueError(
                    "Admin surface must not receive registration OAuth audiences."
                )
            if self.allowed_google_hosted_domain_list:
                raise ValueError(
                    "Admin surface must not receive the registration hosted-domain gate."
                )
            if self.cors_allowed_origin_list:
                raise ValueError(
                    "Admin surface is server-to-server and must not enable CORS."
                )
            if self.api_writes_activation_confirmation.strip():
                raise ValueError(
                    "Admin surface must not receive the public API write confirmation."
                )
            if self.admin_mutations_enabled:
                if (
                    self.admin_mutations_activation_confirmation
                    != PRODUCTION_ADMIN_MUTATIONS_ACTIVATION_CONFIRMATION
                ):
                    raise ValueError(
                        "Production admin mutation activation confirmation "
                        "is missing."
                    )
            elif self.admin_mutations_activation_confirmation.strip():
                raise ValueError(
                    "Production admin mutation activation confirmation must "
                    "be empty while mutations are disabled."
                )
            if self.phase10a_export_api_enabled:
                if (
                    self.phase10a_export_activation_confirmation
                    != PRODUCTION_EXPORT_ACTIVATION_CONFIRMATION
                ):
                    raise ValueError(
                        "Production export activation confirmation is missing."
                    )
            elif self.phase10a_export_activation_confirmation.strip():
                raise ValueError(
                    "Production export activation confirmation must be empty "
                    "while export is disabled."
                )
            write_capability_enabled = (
                self.admin_mutations_enabled or self.phase10a_export_api_enabled
            )
            if self.api_read_only_mode == write_capability_enabled:
                raise ValueError(
                    "Admin read-only mode must match mutation/export activation."
                )
            if self.external_side_effects_enabled or self.phase7_worker_api_enabled:
                raise ValueError("Admin API must not execute worker side effects.")
            if any(
                (
                    self.google_drive_oauth_client_id,
                    self.google_drive_oauth_client_secret,
                    self.google_drive_oauth_refresh_token,
                )
            ):
                raise ValueError("Admin API must not receive Drive OAuth secrets.")
            if self.drive_resource_id.strip():
                raise ValueError("Admin API must not receive the Drive resource ID.")

        if active_surface == "worker":
            self.validate_no_admin_configuration(surface="worker")
            if self.phase5_local_api_enabled or self.phase6_auth_api_enabled:
                raise ValueError("Worker must not expose public/local authentication APIs.")
            if self.worker_auth_mode != "cloud_run_oidc":
                raise ValueError("Production worker requires Cloud Run IAM/OIDC.")
            if not self.worker_oidc_audience.startswith("https://"):
                raise ValueError("Worker OIDC audience is not configured.")
            if not self.worker_invoker_service_account.endswith(
                ".gserviceaccount.com"
            ):
                raise ValueError("Worker invoker service account is not configured.")
            standby_flags = (
                not self.phase7_worker_api_enabled
                and not self.phase7_drive_api_enabled
                and not self.external_side_effects_enabled
                and self.phase7_drive_kill_switch
            )
            active_flags = (
                self.phase7_worker_api_enabled
                and self.phase7_drive_api_enabled
                and self.external_side_effects_enabled
                and not self.phase7_drive_kill_switch
            )
            if not standby_flags and not active_flags:
                raise ValueError(
                    "Production worker activation flags are inconsistent."
                )
            notification_standby = (
                not self.phase7_notification_delivery_enabled
                and self.phase7_notification_kill_switch
                and not self.phase7_notification_activation_confirmation.strip()
                and not self.gas_notification_webhook_url.strip()
            )
            notification_active = (
                self.phase7_notification_delivery_enabled
                and not self.phase7_notification_kill_switch
            )
            if not notification_standby and not notification_active:
                raise ValueError(
                    "Production notification activation flags are inconsistent."
                )
            if (
                standby_flags
                and self.phase7_drive_activation_confirmation.strip()
            ):
                raise ValueError(
                    "Production Drive activation confirmation must be empty "
                    "while the worker is in standby."
                )
            if active_flags:
                self.validate_phase7_worker_boundary()
                self.validate_phase7_google_drive_configuration()
                if self.drive_resource_id.startswith(("phase", "synthetic")):
                    raise ValueError("Production Drive resource is a placeholder.")
                if self.google_drive_oauth_token_url != (
                    "https://oauth2.googleapis.com/token"
                ):
                    raise ValueError("Production OAuth token endpoint is invalid.")
                if self.google_drive_api_base_url != (
                    "https://www.googleapis.com/drive/v3"
                ):
                    raise ValueError("Production Drive API endpoint is invalid.")
            if notification_active:
                self.validate_phase7_notification_boundary()


@lru_cache
def get_settings() -> Settings:
    return Settings()
