variable "project_id" {
  description = "Dedicated Google Cloud project for Library registration."
  type        = string
}

variable "region" {
  description = "Cloud Run region. Keep this aligned with the approved data-location record."
  type        = string
  default     = "asia-southeast1"
}

variable "public_image" {
  description = "Immutable digest URI built from Docker target public."
  type        = string

  validation {
    condition     = can(regex("^.+@sha256:[0-9a-f]{64}$", var.public_image))
    error_message = "public_image must be an immutable lowercase SHA-256 digest URI."
  }
}

variable "worker_image" {
  description = "Immutable digest URI built from Docker target worker."
  type        = string

  validation {
    condition     = can(regex("^.+@sha256:[0-9a-f]{64}$", var.worker_image))
    error_message = "worker_image must be an immutable lowercase SHA-256 digest URI."
  }
}

variable "migration_image" {
  description = "Immutable digest URI built from Docker target migration."
  type        = string

  validation {
    condition     = can(regex("^.+@sha256:[0-9a-f]{64}$", var.migration_image))
    error_message = "migration_image must be an immutable lowercase SHA-256 digest URI."
  }
}

variable "frontend_origin" {
  description = "Exact HTTPS Cloudflare Pages origin; paths, query strings, fragments, credentials, and wildcards are forbidden."
  type        = string

  validation {
    condition = can(regex(
      "^https://([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}(:[1-9][0-9]{0,4})?$",
      var.frontend_origin,
    ))
    error_message = "frontend_origin must be one exact HTTPS DNS origin without a path, query, fragment, credentials, or wildcard."
  }
}

variable "google_oauth_client_ids" {
  description = "Comma-separated public Web OAuth client IDs. This value is not a client secret."
  type        = string
}

variable "google_admin_oauth_client_ids" {
  description = "Comma-separated administrator Web OAuth client IDs, separate from registration audiences."
  type        = string
  default     = ""
}

variable "admin_image" {
  description = "Immutable digest URI built from Docker target admin. Leave empty while the administrator API is disabled."
  type        = string
  default     = ""

  validation {
    condition = (
      trimspace(var.admin_image) == "" ||
      can(regex("^.+@sha256:[0-9a-f]{64}$", var.admin_image))
    )
    error_message = "admin_image must be empty or an immutable lowercase SHA-256 digest URI."
  }
}

variable "admin_preauth_rate_limit_per_minute" {
  description = "Per-instance global request limit applied before administrator Google token verification. Keep Cloud Run max_instance_count at one unless this moves to shared enforcement."
  type        = number
  default     = 30

  validation {
    condition = (
      var.admin_preauth_rate_limit_per_minute >= 1 &&
      var.admin_preauth_rate_limit_per_minute <= 120 &&
      floor(var.admin_preauth_rate_limit_per_minute) == var.admin_preauth_rate_limit_per_minute
    )
    error_message = "admin_preauth_rate_limit_per_minute must be an integer from 1 through 120."
  }
}

variable "api_runtime_database_role" {
  description = "Exact non-owner LOGIN role encoded in the public API DATABASE_URL."
  type        = string
  default     = ""

  validation {
    condition = (
      trimspace(var.api_runtime_database_role) == "" || (
        can(regex("^[a-z_][a-z0-9_]{0,62}$", lower(trimspace(var.api_runtime_database_role)))) &&
        lower(trimspace(var.api_runtime_database_role)) != "postgres" &&
        lower(trimspace(var.api_runtime_database_role)) != "root" &&
        !strcontains(lower(trimspace(var.api_runtime_database_role)), "owner") &&
        !strcontains(lower(trimspace(var.api_runtime_database_role)), "admin") &&
        !strcontains(lower(trimspace(var.api_runtime_database_role)), "superuser")
      )
    )
    error_message = "api_runtime_database_role must be a valid explicit non-owner LOGIN role name."
  }
}

variable "worker_runtime_database_role" {
  description = "Exact non-owner LOGIN role encoded in the worker DATABASE_URL."
  type        = string
  default     = ""

  validation {
    condition = (
      trimspace(var.worker_runtime_database_role) == "" || (
        can(regex("^[a-z_][a-z0-9_]{0,62}$", lower(trimspace(var.worker_runtime_database_role)))) &&
        lower(trimspace(var.worker_runtime_database_role)) != "postgres" &&
        lower(trimspace(var.worker_runtime_database_role)) != "root" &&
        !strcontains(lower(trimspace(var.worker_runtime_database_role)), "owner") &&
        !strcontains(lower(trimspace(var.worker_runtime_database_role)), "admin") &&
        !strcontains(lower(trimspace(var.worker_runtime_database_role)), "superuser")
      )
    )
    error_message = "worker_runtime_database_role must be a valid explicit non-owner LOGIN role name."
  }
}

variable "admin_runtime_database_role" {
  description = "Exact non-owner LOGIN role encoded in the administrator API DATABASE_URL."
  type        = string
  default     = ""

  validation {
    condition = (
      trimspace(var.admin_runtime_database_role) == "" || (
        can(regex("^[a-z_][a-z0-9_]{0,62}$", lower(trimspace(var.admin_runtime_database_role)))) &&
        lower(trimspace(var.admin_runtime_database_role)) != "postgres" &&
        lower(trimspace(var.admin_runtime_database_role)) != "root" &&
        !strcontains(lower(trimspace(var.admin_runtime_database_role)), "owner") &&
        !strcontains(lower(trimspace(var.admin_runtime_database_role)), "admin") &&
        !strcontains(lower(trimspace(var.admin_runtime_database_role)), "superuser")
      )
    )
    error_message = "admin_runtime_database_role must be a valid explicit non-owner LOGIN role name."
  }
}

variable "allowed_google_hosted_domains" {
  description = "Organization admission gate only; it never replaces form eligibility."
  type        = string
  default     = "st.kitasato-u.ac.jp"
}

variable "public_registration_rpc_key_version" {
  description = "Version label for the independent public database RPC capability. Rotate by provisioning a new version before switching the public service."
  type        = string
  default     = "v1"

  validation {
    condition     = can(regex("^v[1-9][0-9]*$", var.public_registration_rpc_key_version))
    error_message = "public_registration_rpc_key_version must use v followed by a positive integer."
  }
}

variable "terms_version" {
  description = "Human-approved immutable terms version; draft values are forbidden."
  type        = string

  validation {
    condition     = length(trimspace(var.terms_version)) > 0 && !strcontains(lower(var.terms_version), "draft")
    error_message = "terms_version must identify the approved non-draft terms."
  }
}

variable "privacy_version" {
  description = "Human-approved immutable privacy version; draft values are forbidden."
  type        = string

  validation {
    condition     = length(trimspace(var.privacy_version)) > 0 && !strcontains(lower(var.privacy_version), "draft")
    error_message = "privacy_version must identify the approved non-draft privacy notice."
  }
}

variable "terms_content_sha256" {
  description = "Lowercase SHA-256 of the exact human-approved terms content."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.terms_content_sha256))
    error_message = "terms_content_sha256 must be a lowercase 64-character SHA-256."
  }
}

variable "privacy_content_sha256" {
  description = "Lowercase SHA-256 of the exact human-approved privacy content."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.privacy_content_sha256))
    error_message = "privacy_content_sha256 must be a lowercase 64-character SHA-256."
  }
}

variable "worker_oidc_audience" {
  description = "Stable custom Cloud Run audience for Scheduler OIDC; this avoids a self-URI dependency cycle."
  type        = string

  validation {
    condition     = can(regex("^https://[^* /]+$", var.worker_oidc_audience))
    error_message = "worker_oidc_audience must be one exact HTTPS audience."
  }
}

variable "worker_drive_activation" {
  description = "Fail-closed Drive worker activation. Enabling requires the exact reviewed confirmation string."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.worker_drive_activation.enabled && trimspace(var.worker_drive_activation.confirmation) == "") ||
      (var.worker_drive_activation.enabled && var.worker_drive_activation.confirmation == "I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1")
    )
    error_message = "Drive worker activation requires the exact reviewed confirmation; disabled state requires an empty confirmation."
  }
}

variable "worker_notification_activation" {
  description = "Independent fail-closed GAS MailApp notification gate. It may be enabled only after the Drive worker is active."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.worker_notification_activation.enabled && trimspace(var.worker_notification_activation.confirmation) == "") ||
      (var.worker_notification_activation.enabled && var.worker_notification_activation.confirmation == "I_APPROVED_PRODUCTION_GAS_EMAIL_NOTIFICATIONS_V1")
    )
    error_message = "GAS notification activation requires the exact reviewed confirmation; disabled state requires an empty confirmation."
  }
}

variable "gas_notification_webhook_url" {
  description = "Private GAS notification-only web-app URL. Keep it in an uncommitted sensitive tfvars file; this is not a Secret Manager payload."
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition = (
      trimspace(var.gas_notification_webhook_url) == "" ||
      can(regex("^https://script\\.google\\.com/macros/s/[^/?#[:space:]]+/exec$", var.gas_notification_webhook_url))
    )
    error_message = "The GAS notification webhook must be blank or one exact script.google.com /macros/s/.../exec HTTPS URL."
  }
}

variable "admin_api_activation" {
  description = "Fail-closed production admin API activation after bootstrap, MFA, and host review."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.admin_api_activation.enabled && trimspace(var.admin_api_activation.confirmation) == "") ||
      (var.admin_api_activation.enabled && var.admin_api_activation.confirmation == "I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1")
    )
    error_message = "Admin API activation requires the exact reviewed confirmation; disabled state requires an empty confirmation."
  }
}

variable "runtime_services_activation" {
  description = "One-way bootstrap gate for public and worker Cloud Run services after the migration job has completed successfully."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.runtime_services_activation.enabled && trimspace(var.runtime_services_activation.confirmation) == "") ||
      (var.runtime_services_activation.enabled && var.runtime_services_activation.confirmation == "I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1")
    )
    error_message = "Runtime service activation requires the exact post-migration confirmation; bootstrap state requires an empty confirmation."
  }
}

variable "admin_mutations_activation" {
  description = "Fail-closed administrative decision, retry, revoke, and deactivate activation."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.admin_mutations_activation.enabled && trimspace(var.admin_mutations_activation.confirmation) == "") ||
      (var.admin_mutations_activation.enabled && var.admin_mutations_activation.confirmation == "I_APPROVED_PRODUCTION_ADMIN_MUTATIONS_AFTER_MFA_AND_RECOVERY_REVIEW_V1")
    )
    error_message = "Admin mutations require the exact reviewed confirmation; disabled state requires an empty confirmation."
  }
}

variable "cost_guardrails_review" {
  description = "Human-verified near-zero cost gate. Runtime services cannot be created until a Cloud Run spend cap and a project-wide alerts-only budget have been reviewed in the target project."
  type = object({
    enabled                  = bool
    cloud_run_spend_cap_usd  = number
    project_alert_budget_usd = number
    confirmation             = string
  })
  default = {
    enabled                  = false
    cloud_run_spend_cap_usd  = 0
    project_alert_budget_usd = 0
    confirmation             = ""
  }

  validation {
    condition = (
      (!var.cost_guardrails_review.enabled &&
        var.cost_guardrails_review.cloud_run_spend_cap_usd == 0 &&
        var.cost_guardrails_review.project_alert_budget_usd == 0 &&
      trimspace(var.cost_guardrails_review.confirmation) == "") ||
      (var.cost_guardrails_review.enabled &&
        var.cost_guardrails_review.cloud_run_spend_cap_usd > 0 &&
        var.cost_guardrails_review.cloud_run_spend_cap_usd <= 5 &&
        var.cost_guardrails_review.project_alert_budget_usd >= var.cost_guardrails_review.cloud_run_spend_cap_usd &&
        var.cost_guardrails_review.project_alert_budget_usd <= 10 &&
      var.cost_guardrails_review.confirmation == "I_VERIFIED_CLOUD_RUN_SPEND_CAP_AND_NEAR_ZERO_COST_GUARDRAILS_V1")
    )
    error_message = "Cost guardrails require a positive Cloud Run spend cap up to USD 5, a project alert budget between that cap and USD 10, and the exact reviewed confirmation; disabled state requires zero amounts and an empty confirmation."
  }
}

variable "public_ingress_activation" {
  description = "Fail-closed public Cloud Run invoker gate. It can be disabled independently to stop new public requests without destroying the runtime."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.public_ingress_activation.enabled && trimspace(var.public_ingress_activation.confirmation) == "") ||
      (var.public_ingress_activation.enabled && var.public_ingress_activation.confirmation == "I_APPROVED_PUBLIC_CLOUD_RUN_INGRESS_AFTER_COST_AND_RECOVERY_REVIEW_V1")
    )
    error_message = "Public ingress activation requires the exact cost/recovery confirmation; disabled state requires an empty confirmation."
  }
}

variable "public_api_write_activation" {
  description = "Fail-closed public write gate. Disabled means API_READ_ONLY_MODE=true; restoring writes requires the exact reviewed confirmation."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.public_api_write_activation.enabled && trimspace(var.public_api_write_activation.confirmation) == "") ||
      (var.public_api_write_activation.enabled && var.public_api_write_activation.confirmation == "I_APPROVED_PRODUCTION_API_WRITES_AFTER_RECOVERY_REVIEW_V1")
    )
    error_message = "Public API writes require the exact reviewed confirmation; read-only state requires an empty confirmation."
  }
}

variable "phase10a_export_activation" {
  description = "Fail-closed Phase 10A export activation after data-handling, production auth, and DB role review."
  type = object({
    enabled      = bool
    confirmation = string
  })
  default = {
    enabled      = false
    confirmation = ""
  }

  validation {
    condition = (
      (!var.phase10a_export_activation.enabled && trimspace(var.phase10a_export_activation.confirmation) == "") ||
      (var.phase10a_export_activation.enabled && var.phase10a_export_activation.confirmation == "I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1")
    )
    error_message = "Phase 10A export activation requires the exact reviewed confirmation; disabled state requires an empty confirmation."
  }
}

variable "secret_ids" {
  description = "Existing Secret Manager secret IDs; Terraform never creates secret containers or payloads. Inactive admin and Drive capabilities may leave their IDs empty."
  type = object({
    api_database_url                = string
    admin_database_url              = optional(string, "")
    admin_allowed_emails            = optional(string, "")
    admin_edge_shared_secret        = optional(string, "")
    worker_database_url             = string
    migration_database_url          = string
    drive_oauth_client_id           = optional(string, "")
    drive_oauth_client_secret       = optional(string, "")
    drive_oauth_refresh_token       = optional(string, "")
    drive_resource_id               = optional(string, "")
    drive_operation_attestation_key = string
    public_registration_rpc_token   = string
  })
}

variable "secret_versions" {
  description = "Pinned numeric Secret Manager versions. Rotation changes these values and creates a new revision. Inactive admin and Drive capabilities may leave their versions empty."
  type = object({
    api_database_url                = string
    admin_database_url              = optional(string, "")
    admin_allowed_emails            = optional(string, "")
    admin_edge_shared_secret        = optional(string, "")
    worker_database_url             = string
    migration_database_url          = string
    drive_oauth_client_id           = optional(string, "")
    drive_oauth_client_secret       = optional(string, "")
    drive_oauth_refresh_token       = optional(string, "")
    drive_resource_id               = optional(string, "")
    drive_operation_attestation_key = string
    public_registration_rpc_token   = string
  })

  validation {
    condition = alltrue([
      for value in values(var.secret_versions) :
      trimspace(value) == "" || can(regex("^[1-9][0-9]*$", value))
    ])
    error_message = "Every configured secret version must be a pinned positive integer, never latest."
  }
}

variable "notification_channel_names" {
  description = "Existing Cloud Monitoring channel resource names. Empty disables alert policies."
  type        = list(string)
  default     = []

  validation {
    condition = (
      length(var.notification_channel_names) <= 20 &&
      length(toset(var.notification_channel_names)) == length(var.notification_channel_names) &&
      alltrue([
        for value in var.notification_channel_names :
        can(regex("^projects/[^/[:space:]]+/notificationChannels/[^/[:space:]]+$", value))
      ])
    )
    error_message = "Notification channels must be 20 or fewer unique, nonblank full resource names."
  }
}
