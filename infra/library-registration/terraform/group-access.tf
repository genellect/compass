variable "group_access" {
  description = "New members only. Keep disabled until isolated Groups/Drive E2E and catalogue provisioning pass."
  type = object({
    producers_enabled = optional(bool, false)
    worker_enabled    = optional(bool, false)
    cutover_at        = optional(string, "")
    g0_g2_verified    = optional(bool, false)
    allowed_group_ids = optional(list(string), [])
    oauth_secrets = optional(map(object({
      secret  = string
      version = string
    })), {})
  })
  default = {}
  validation {
    condition = !var.group_access.producers_enabled || (
      var.group_access.worker_enabled && var.group_access.g0_g2_verified &&
      can(formatdate("YYYY", var.group_access.cutover_at))
    )
    error_message = "New-member cutover requires verified G0/G2, an enabled group worker and an RFC3339 cutoff."
  }
  validation {
    condition = !var.group_access.worker_enabled || (
      var.group_access.g0_g2_verified &&
      length(var.group_access.allowed_group_ids) > 0 &&
      length(distinct(var.group_access.allowed_group_ids)) == length(var.group_access.allowed_group_ids) &&
      alltrue([for id in var.group_access.allowed_group_ids : can(regex("^groups/[a-zA-Z0-9_-]+$", id))]) &&
      alltrue([for binding in values(var.group_access.oauth_secrets) :
        trimspace(binding.secret) != "" && can(regex("^[1-9][0-9]*$", binding.version))
      ]) &&
      toset(keys(var.group_access.oauth_secrets)) == toset([
        "GOOGLE_GROUPS_OAUTH_CLIENT_ID", "GOOGLE_GROUPS_OAUTH_CLIENT_SECRET", "GOOGLE_GROUPS_OAUTH_REFRESH_TOKEN"
      ])
    )
    error_message = "Group worker requires immutable group IDs, verified G0/G2 and three separate Groups OAuth Secret Manager bindings."
  }
}

locals {
  group_producer_env = var.group_access.producers_enabled ? {
    GROUP_ACCESS_ENABLED    = "true"
    GROUP_ACCESS_CUTOVER_AT = var.group_access.cutover_at
  } : {}
  group_worker_env = {
    GROUP_WORKER_ENABLED      = tostring(var.group_access.worker_enabled)
    GOOGLE_GROUPS_ALLOWED_IDS = join(",", var.group_access.allowed_group_ids)
  }
  group_secret_bindings = var.runtime_services_activation.enabled && var.group_access.worker_enabled ? {
    for name, binding in var.group_access.oauth_secrets : "groups_${name}" => {
      secret = binding.secret
      member = google_service_account.worker.member
    }
  } : {}
}
