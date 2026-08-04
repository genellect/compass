mock_provider "google" {}

variables {
  project_id                   = "fsl-production-gate"
  region                       = "asia-southeast1"
  public_image                 = "asia-southeast1-docker.pkg.dev/fsl-production-gate/fsl/public@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  worker_image                 = "asia-southeast1-docker.pkg.dev/fsl-production-gate/fsl/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  migration_image              = "asia-southeast1-docker.pkg.dev/fsl-production-gate/fsl/migration@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  frontend_origin              = "https://compass-official.pages.dev"
  google_oauth_client_ids      = "123456789012-production.apps.googleusercontent.com"
  api_runtime_database_role    = "fsl_api_login"
  worker_runtime_database_role = "fsl_worker_login"
  worker_oidc_audience         = "https://fsl-registration-worker.internal"
  terms_version                = "terms-1.0"
  privacy_version              = "privacy-1.0"
  terms_content_sha256         = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  privacy_content_sha256       = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

  secret_ids = {
    api_database_url                = "fsl-api-database-url"
    worker_database_url             = "fsl-worker-database-url"
    migration_database_url          = "fsl-migration-database-url"
    drive_operation_attestation_key = "fsl-drive-operation-attestation-key"
    public_registration_rpc_token   = "fsl-public-registration-rpc-token"
  }
  secret_versions = {
    api_database_url                = "1"
    worker_database_url             = "1"
    migration_database_url          = "1"
    drive_operation_attestation_key = "1"
    public_registration_rpc_token   = "1"
  }
}

run "migration_only_bootstrap_has_no_runtime_services" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service.public) == 0
    error_message = "Migration-only bootstrap must not create the public runtime service."
  }
  assert {
    condition     = length(google_cloud_run_v2_service.worker) == 0
    error_message = "Migration-only bootstrap must not create the worker runtime service."
  }
  assert {
    condition     = length(google_cloud_run_v2_service.admin) == 0
    error_message = "Migration-only bootstrap must not create the administrator runtime service."
  }
  assert {
    condition     = length(google_service_account.admin) == 0
    error_message = "An inactive administrator capability must not create an administrator service account."
  }
  assert {
    condition     = google_cloud_run_v2_job.migration.name == "fsl-registration-migration"
    error_message = "Migration-only bootstrap must still create the migration job."
  }
}

run "runtime_capability_before_bootstrap_is_rejected" {
  command = plan

  variables {
    admin_api_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1"
    }
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "runtime_without_cost_guardrails_is_rejected" {
  command = plan

  variables {
    runtime_services_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_RUNTIME_SERVICES_AFTER_MIGRATION_V1"
    }
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "runtime_without_notification_channel_is_rejected" {
  command = plan

  variables {
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
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "runtime_standby_with_cost_controls_has_no_public_invoker" {
  command = plan

  variables {
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
    notification_channel_names = ["projects/fsl-production-gate/notificationChannels/1"]
  }

  assert {
    condition     = length(google_cloud_run_v2_service.public) == 1
    error_message = "Reviewed runtime activation must create the public service."
  }
  assert {
    condition     = length(google_cloud_run_v2_service.worker) == 1
    error_message = "Reviewed runtime activation must create the private worker service."
  }
  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_invoker) == 0
    error_message = "Runtime standby must not create an unauthenticated public invoker."
  }
  assert {
    condition     = length(google_cloud_scheduler_job.worker) == 0
    error_message = "Runtime standby must not start Drive polling."
  }
  assert {
    condition     = length(google_cloud_run_v2_service.admin) == 0
    error_message = "Runtime standby must not create the administrator service before its separate gate."
  }
  assert {
    condition     = length(google_service_account.admin) == 0
    error_message = "Registration-only runtime standby must not create an administrator service account."
  }
  assert {
    condition = (
      coalesce(try(google_cloud_run_v2_service.public[0].scaling[0].manual_instance_count, null), 0) == 0 &&
      coalesce(try(google_cloud_run_v2_service.public[0].scaling[0].min_instance_count, null), 0) == 0 &&
      coalesce(try(google_cloud_run_v2_service.public[0].scaling[0].scaling_mode, null), "AUTOMATIC") == "AUTOMATIC" &&
      google_cloud_run_v2_service.public[0].template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.public[0].template[0].scaling[0].max_instance_count == 1 &&
      coalesce(try(google_cloud_run_v2_service.worker[0].scaling[0].manual_instance_count, null), 0) == 0 &&
      coalesce(try(google_cloud_run_v2_service.worker[0].scaling[0].min_instance_count, null), 0) == 0 &&
      coalesce(try(google_cloud_run_v2_service.worker[0].scaling[0].scaling_mode, null), "AUTOMATIC") == "AUTOMATIC" &&
      google_cloud_run_v2_service.worker[0].template[0].scaling[0].min_instance_count == 0 &&
      google_cloud_run_v2_service.worker[0].template[0].scaling[0].max_instance_count == 1
    )
    error_message = "Registration-only runtime services must use automatic scaling, scale from zero, and never exceed one instance."
  }
  assert {
    condition = one([
      for env in google_cloud_run_v2_service.public[0].template[0].containers[0].env : env.value
      if env.name == "API_READ_ONLY_MODE"
    ]) == "true"
    error_message = "Registration-only runtime standby must remain read-only by default."
  }
  assert {
    condition = one([
      for env in google_cloud_run_v2_service.public[0].template[0].containers[0].env : env.value
      if env.name == "CORS_ALLOWED_ORIGINS"
    ]) == "https://compass-official.pages.dev"
    error_message = "The public service must receive exactly the reviewed frontend origin."
  }
}

run "frontend_origin_with_path_is_rejected" {
  command = plan

  variables {
    frontend_origin = "https://compass-official.pages.dev/library-registration/"
  }

  expect_failures = [var.frontend_origin]
}

run "frontend_origin_with_query_is_rejected" {
  command = plan

  variables {
    frontend_origin = "https://compass-official.pages.dev?preview=true"
  }

  expect_failures = [var.frontend_origin]
}

run "admin_activation_requires_admin_only_artifacts" {
  command = plan

  variables {
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
    notification_channel_names    = ["projects/fsl-production-gate/notificationChannels/1"]
    google_admin_oauth_client_ids = "123456789012-admin.apps.googleusercontent.com"
    api_runtime_database_role     = "fsl_api_login"
    worker_runtime_database_role  = "fsl_worker_login"
    admin_runtime_database_role   = "fsl_console_login"
    admin_api_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_ADMIN_API_AFTER_MFA_BOOTSTRAP_V1"
    }
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "drive_activation_requires_drive_only_secrets" {
  command = plan

  variables {
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
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "notification_activation_requires_drive_worker" {
  command = plan

  variables {
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
    notification_channel_names = ["projects/fsl-production-gate/notificationChannels/1"]
    worker_notification_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_GAS_EMAIL_NOTIFICATIONS_V1"
    }
    gas_notification_webhook_url = "https://script.google.com/macros/s/synthetic-notification/exec"
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "notification_activation_requires_private_webhook_url" {
  command = plan

  variables {
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
    notification_channel_names = ["projects/fsl-production-gate/notificationChannels/1"]
    worker_drive_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1"
    }
    worker_notification_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_GAS_EMAIL_NOTIFICATIONS_V1"
    }
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "notification_activation_reuses_attestation_secret_without_new_binding" {
  command = plan

  variables {
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
    notification_channel_names = ["projects/fsl-production-gate/notificationChannels/1"]
    worker_drive_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1"
    }
    worker_notification_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_GAS_EMAIL_NOTIFICATIONS_V1"
    }
    gas_notification_webhook_url = "https://script.google.com/macros/s/synthetic-notification/exec"
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

  assert {
    condition = one([
      for env in google_cloud_run_v2_service.worker[0].template[0].containers[0].env : env.value
      if env.name == "PHASE7_NOTIFICATION_DELIVERY_ENABLED"
    ]) == "true"
    error_message = "The worker must receive the independently approved notification enable flag."
  }
  assert {
    condition = one([
      for env in google_cloud_run_v2_service.worker[0].template[0].containers[0].env : env.value
      if env.name == "PHASE7_NOTIFICATION_KILL_SWITCH"
    ]) == "false"
    error_message = "The notification kill switch must be off only after the exact gate."
  }
  assert {
    condition     = length(google_secret_manager_secret_iam_member.access) == 11
    error_message = "Notification delivery must reuse the existing attestation secret and add no Secret Manager binding."
  }
  assert {
    condition = alltrue([
      for binding_key in keys(google_secret_manager_secret_iam_member.access) :
      !strcontains(binding_key, "notification") && !strcontains(binding_key, "mail")
    ])
    error_message = "No notification-specific Secret Manager capability may be created."
  }
}

run "public_ingress_after_cost_review_is_allowed" {
  command = plan

  variables {
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
    public_ingress_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PUBLIC_CLOUD_RUN_INGRESS_AFTER_COST_AND_RECOVERY_REVIEW_V1"
    }
    notification_channel_names = ["projects/fsl-production-gate/notificationChannels/1"]
  }

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_invoker) == 1
    error_message = "Exact public ingress approval must create exactly one invoker binding."
  }
}

run "public_ingress_requires_runtime" {
  command = plan

  variables {
    public_ingress_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PUBLIC_CLOUD_RUN_INGRESS_AFTER_COST_AND_RECOVERY_REVIEW_V1"
    }
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "public_ingress_requires_exact_confirmation" {
  command = plan

  variables {
    public_ingress_activation = {
      enabled      = true
      confirmation = "wrong"
    }
  }

  expect_failures = [var.public_ingress_activation]
}

run "blank_notification_channel_is_rejected" {
  command = plan

  variables {
    notification_channel_names = [""]
  }

  expect_failures = [var.notification_channel_names]
}

run "cross_project_runtime_notification_is_rejected" {
  command = plan

  variables {
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
    notification_channel_names = ["projects/other-project/notificationChannels/1"]
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "cost_guardrails_require_exact_confirmation" {
  command = plan

  variables {
    cost_guardrails_review = {
      enabled                  = true
      cloud_run_spend_cap_usd  = 0.20
      project_alert_budget_usd = 1
      confirmation             = "wrong"
    }
  }

  expect_failures = [var.cost_guardrails_review]
}

run "export_without_admin_is_rejected" {
  command = plan

  variables {
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
    notification_channel_names = ["projects/fsl-production-gate/notificationChannels/1"]
    phase10a_export_activation = {
      enabled      = true
      confirmation = "I_APPROVED_PRODUCTION_PHASE10A_EXPORT_AFTER_DATA_HANDLING_REVIEW_V1"
    }
  }

  expect_failures = [google_cloud_run_v2_job.migration]
}

run "write_activation_requires_exact_confirmation" {
  command = plan

  variables {
    public_api_write_activation = {
      enabled      = true
      confirmation = "wrong"
    }
  }

  expect_failures = [var.public_api_write_activation]
}
