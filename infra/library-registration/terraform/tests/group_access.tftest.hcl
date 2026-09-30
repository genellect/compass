mock_provider "google" {}

# Mock provider only: no live plan, credentials, database or Drive operations.
variables {
  project_id              = "fsl-production-gate"
  region                  = "asia-southeast1"
  public_image            = "asia-southeast1-docker.pkg.dev/fsl-production-gate/fsl/public@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  worker_image            = "asia-southeast1-docker.pkg.dev/fsl-production-gate/fsl/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  migration_image         = "asia-southeast1-docker.pkg.dev/fsl-production-gate/fsl/migration@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  frontend_origin         = "https://compass-official.pages.dev"
  google_oauth_client_ids = "123456789012-production.apps.googleusercontent.com"
  worker_oidc_audience    = "https://fsl-registration-worker.internal"
  terms_version           = "terms-1.0"
  privacy_version         = "privacy-1.0"
  terms_content_sha256    = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  privacy_content_sha256  = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"


  runtime_services_activation = {
    enabled      = true
    confirmation = "I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1"
  }
  cost_guardrails_review = {
    enabled                  = true
    cloud_run_spend_cap_usd  = 0.20
    project_alert_budget_usd = 1
    confirmation             = "I_VERIFIED_CLOUD_RUN_SPEND_CAP_AND_NEAR_ZERO_COST_GUARDRAILS_V1"
  }
  notification_channel_names   = ["projects/fsl-production-gate/notificationChannels/1"]
  api_runtime_database_role    = "fsl_api_login"
  worker_runtime_database_role = "fsl_worker_login"
  worker_drive_activation = {
    enabled      = true
    confirmation = "I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1"
  }
  secret_ids = {
    api_database_url                = "fsl-api-database-url"
    worker_database_url             = "fsl-worker-database-url"
    migration_database_url          = "fsl-migration-database-url"
    drive_oauth_client_id           = "fsl-drive-oauth-client-id"
    drive_oauth_client_secret       = "fsl-drive-oauth-client-secret"
    drive_oauth_refresh_token       = "fsl-drive-oauth-refresh-token"
    drive_resource_id               = "fsl-drive-resource-id"
    drive_operation_attestation_key = "fsl-drive-operation-attestation-key"
    public_registration_rpc_token   = "fsl-public-registration-rpc-token"
  }
  secret_versions = {
    api_database_url                = "1"
    worker_database_url             = "1"
    migration_database_url          = "1"
    drive_oauth_client_id           = "1"
    drive_oauth_client_secret       = "1"
    drive_oauth_refresh_token       = "1"
    drive_resource_id               = "1"
    drive_operation_attestation_key = "1"
    public_registration_rpc_token   = "1"
  }

}

run "groups_disabled_does_not_add_secrets_or_public_flag" {
  command = plan
  assert {
    condition     = length(local.group_secret_bindings) == 0 && length(local.group_producer_env) == 0
    error_message = "Default deployment must not enable group routing or bind Groups secrets."
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.worker[0].template[0].containers[0].env : e.value if e.name == "GROUP_WORKER_ENABLED"]) == "false"
    error_message = "Group worker must be disabled by default."
  }
}

run "unverified_groups_cannot_activate" {
  command = plan
  variables {
    group_access = { producers_enabled = true }
  }
  expect_failures = [var.group_access]
}

run "verified_groups_bind_only_worker_credentials" {
  command = plan
  variables {
    group_access = {
      worker_enabled    = true
      producers_enabled = true
      cutover_at        = "2027-04-01T00:00:00Z"
      g0_g2_verified    = true
      allowed_group_ids = ["groups/SYNTHETIC"]
      oauth_secrets = {
        GOOGLE_GROUPS_OAUTH_CLIENT_ID     = { secret = "fsl-groups-client", version = "1" }
        GOOGLE_GROUPS_OAUTH_CLIENT_SECRET = { secret = "fsl-groups-secret", version = "1" }
        GOOGLE_GROUPS_OAUTH_REFRESH_TOKEN = { secret = "fsl-groups-refresh", version = "1" }
      }
    }
  }
  assert {
    condition     = length(local.group_secret_bindings) == 3
    error_message = "Exactly three separate Groups credential bindings are required."
  }
  assert {
    condition     = length([for e in google_cloud_run_v2_service.public[0].template[0].containers[0].env : e.name if startswith(e.name, "GOOGLE_GROUPS_")]) == 0
    error_message = "The public API must never receive Groups credentials."
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.public[0].template[0].containers[0].env : e.value if e.name == "GROUP_ACCESS_CUTOVER_AT"]) == "2027-04-01T00:00:00Z"
    error_message = "The exact reviewed cutover must reach the producer."
  }
  assert {
    condition     = length([for e in google_cloud_run_v2_service.worker[0].template[0].containers[0].env : e.name if startswith(e.name, "GOOGLE_GROUPS_OAUTH_")]) == 3
    error_message = "Only the worker receives all three Groups credentials."
  }
}

run "unpinned_group_secret_version_is_rejected" {
  command = plan
  variables {
    group_access = {
      worker_enabled    = true
      producers_enabled = true
      cutover_at        = "2027-04-01T00:00:00Z"
      g0_g2_verified    = true
      allowed_group_ids = ["groups/SYNTHETIC"]
      oauth_secrets = {
        GOOGLE_GROUPS_OAUTH_CLIENT_ID     = { secret = "fsl-groups-client", version = "1" }
        GOOGLE_GROUPS_OAUTH_CLIENT_SECRET = { secret = "fsl-groups-secret", version = "1" }
        GOOGLE_GROUPS_OAUTH_REFRESH_TOKEN = { secret = "fsl-groups-refresh", version = "latest" }
      }
    }
  }
  expect_failures = [var.group_access]
}
