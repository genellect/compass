data "google_project" "current" {}

resource "google_service_account" "public" {
  account_id   = "fsl-registration-api"
  display_name = "Future Strategy Library public API"
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "admin" {
  count        = var.runtime_services_activation.enabled && var.admin_api_activation.enabled ? 1 : 0
  account_id   = "fsl-registration-admin"
  display_name = "Future Strategy Library administrator API"
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "worker" {
  account_id   = "fsl-registration-worker"
  display_name = "Future Strategy Library private Drive worker"
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "migration" {
  account_id   = "fsl-registration-migrate"
  display_name = "Future Strategy Library migration job"
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "scheduler" {
  account_id   = "fsl-registration-scheduler"
  display_name = "Future Strategy Library Scheduler OIDC invoker"
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "task_invoker" {
  count        = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled && var.registration_event_dispatch_activation.enabled ? 1 : 0
  account_id   = "fsl-registration-task-invoker"
  display_name = "Future Strategy Library Cloud Tasks worker invoker"
  depends_on   = [google_project_service.required]
}

locals {
  registration_oauth_client_ids = toset(compact([
    for value in split(",", var.google_oauth_client_ids) : trimspace(value)
  ]))
  admin_oauth_client_ids = toset(compact([
    for value in split(",", var.google_admin_oauth_client_ids) : trimspace(value)
  ]))
  migration_secret_bindings = {
    migration_direct_db  = { secret = var.secret_ids.migration_database_url, member = google_service_account.migration.member }
    migration_public_rpc = { secret = var.secret_ids.public_registration_rpc_token, member = google_service_account.migration.member }
  }
  runtime_secret_bindings = var.runtime_services_activation.enabled ? {
    public_runtime_db  = { secret = var.secret_ids.api_database_url, member = google_service_account.public.member }
    public_runtime_rpc = { secret = var.secret_ids.public_registration_rpc_token, member = google_service_account.public.member }
    worker_runtime_db  = { secret = var.secret_ids.worker_database_url, member = google_service_account.worker.member }
  } : {}
  admin_secret_bindings = var.runtime_services_activation.enabled && var.admin_api_activation.enabled ? {
    admin_runtime_db = { secret = var.secret_ids.admin_database_url, member = google_service_account.admin[0].member }
    admin_allowlist  = { secret = var.secret_ids.admin_allowed_emails, member = google_service_account.admin[0].member }
    admin_edge       = { secret = var.secret_ids.admin_edge_shared_secret, member = google_service_account.admin[0].member }
  } : {}
  attestation_secret_bindings = var.runtime_services_activation.enabled ? merge({
    public_drive_attestation = { secret = var.secret_ids.drive_operation_attestation_key, member = google_service_account.public.member }
    worker_drive_attestation = { secret = var.secret_ids.drive_operation_attestation_key, member = google_service_account.worker.member }
    }, var.admin_api_activation.enabled ? {
    admin_drive_attestation = { secret = var.secret_ids.drive_operation_attestation_key, member = google_service_account.admin[0].member }
  } : {}) : {}
  worker_drive_secret_bindings = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled ? {
    worker_drive_id      = { secret = var.secret_ids.drive_oauth_client_id, member = google_service_account.worker.member }
    worker_drive_secret  = { secret = var.secret_ids.drive_oauth_client_secret, member = google_service_account.worker.member }
    worker_drive_refresh = { secret = var.secret_ids.drive_oauth_refresh_token, member = google_service_account.worker.member }
    worker_resource      = { secret = var.secret_ids.drive_resource_id, member = google_service_account.worker.member }
  } : {}
  secret_bindings = merge(
    local.migration_secret_bindings,
    local.runtime_secret_bindings,
    local.admin_secret_bindings,
    local.attestation_secret_bindings,
    local.worker_drive_secret_bindings,
  )
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each  = local.secret_bindings
  secret_id = each.value.secret
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}

resource "google_cloud_run_v2_service" "public" {
  count               = var.runtime_services_activation.enabled ? 1 : 0
  name                = "fsl-registration-public"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  # Keep the provider's optional service-scaling block addressable without
  # sending an explicit value that Cloud Run normalizes back to null.
  scaling {}

  template {
    service_account                  = google_service_account.public.email
    timeout                          = "15s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.public_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = false
      }

      dynamic "env" {
        for_each = {
          APP_ENV                                             = "production"
          SERVICE_SURFACE                                     = "public"
          PUBLIC_DATABASE_ACCESS_MODE                         = "rpc_v1"
          PUBLIC_REGISTRATION_RPC_KEY_VERSION                 = var.public_registration_rpc_key_version
          PHASE5_LOCAL_API_ENABLED                            = "false"
          PHASE6_AUTH_API_ENABLED                             = "true"
          PHASE7_WORKER_API_ENABLED                           = "false"
          PHASE7_DRIVE_API_ENABLED                            = "false"
          PHASE7_DRIVE_KILL_SWITCH                            = "true"
          EXTERNAL_SIDE_EFFECTS_ENABLED                       = "false"
          PII_LOGGING_ENABLED                                 = "false"
          RATE_LIMITS_ENABLED                                 = "true"
          STRUCTURED_LOGGING_ENABLED                          = "true"
          API_READ_ONLY_MODE                                  = tostring(!var.public_api_write_activation.enabled)
          API_WRITES_ACTIVATION_CONFIRMATION                  = var.public_api_write_activation.confirmation
          GOOGLE_OAUTH_CLIENT_IDS                             = var.google_oauth_client_ids
          ALLOWED_GOOGLE_HOSTED_DOMAINS                       = var.allowed_google_hosted_domains
          RUNTIME_DATABASE_ROLE                               = var.api_runtime_database_role
          TERMS_VERSION                                       = var.terms_version
          PRIVACY_VERSION                                     = var.privacy_version
          TERMS_CONTENT_SHA256                                = var.terms_content_sha256
          PRIVACY_CONTENT_SHA256                              = var.privacy_content_sha256
          CORS_ALLOWED_ORIGINS                                = var.frontend_origin
          MAX_REQUEST_BODY_BYTES                              = "16384"
          PREAUTH_RATE_LIMIT_PER_MINUTE                       = "300"
          SUBMIT_RATE_LIMIT_PER_HOUR                          = "5"
          DB_POOL_SIZE                                        = "2"
          DB_MAX_OVERFLOW                                     = "0"
          REGISTRATION_EVENT_DISPATCH_ENABLED                 = tostring(var.registration_event_dispatch_activation.enabled)
          REGISTRATION_EVENT_DISPATCH_ACTIVATION_CONFIRMATION = var.registration_event_dispatch_activation.confirmation
          CLOUD_TASKS_PROJECT_ID = (
            var.registration_event_dispatch_activation.enabled ? var.project_id : ""
          )
          CLOUD_TASKS_LOCATION = (
            var.registration_event_dispatch_activation.enabled ? var.region : ""
          )
          CLOUD_TASKS_QUEUE_ID = (
            var.registration_event_dispatch_activation.enabled ? "fsl-registration-events" : ""
          )
          CLOUD_TASKS_WORKER_URL = (
            var.registration_event_dispatch_activation.enabled
            ? "${google_cloud_run_v2_service.worker[0].uri}/phase7/internal/operations/process"
            : ""
          )
          CLOUD_TASKS_OIDC_SERVICE_ACCOUNT = (
            var.registration_event_dispatch_activation.enabled
            ? google_service_account.task_invoker[0].email
            : ""
          )
          CLOUD_TASKS_OIDC_AUDIENCE = (
            var.registration_event_dispatch_activation.enabled
            ? var.worker_oidc_audience
            : ""
          )
          CLOUD_TASKS_REQUEST_TIMEOUT_SECONDS = "3"
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids.api_database_url
            version = var.secret_versions.api_database_url
          }
        }
      }

      env {
        name = "DRIVE_OPERATION_ATTESTATION_KEY"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids.drive_operation_attestation_key
            version = var.secret_versions.drive_operation_attestation_key
          }
        }
      }

      env {
        name = "PUBLIC_REGISTRATION_RPC_TOKEN"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids.public_registration_rpc_token
            version = var.secret_versions.public_registration_rpc_token
          }
        }
      }

      startup_probe {
        failure_threshold     = 6
        initial_delay_seconds = 0
        period_seconds        = 5
        timeout_seconds       = 2
        http_get { path = "/health/ready" }
      }
      liveness_probe {
        failure_threshold = 3
        period_seconds    = 30
        timeout_seconds   = 2
        http_get { path = "/health/live" }
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    # Cloud Run reports the unset automatic-scaling values as explicit zeroes.
    # Ignore only that zero/null normalization; the postconditions still fail
    # closed if either value is changed to a billable non-zero setting.
    ignore_changes = [
      scaling[0].manual_instance_count,
      scaling[0].min_instance_count,
    ]

    postcondition {
      condition = (
        coalesce(try(self.scaling[0].manual_instance_count, null), 0) == 0 &&
        coalesce(try(self.scaling[0].min_instance_count, null), 0) == 0 &&
        coalesce(try(self.scaling[0].scaling_mode, null), "AUTOMATIC") == "AUTOMATIC" &&
        self.template[0].scaling[0].min_instance_count == 0 &&
        self.template[0].scaling[0].max_instance_count == 1
      )
      error_message = "The public service must use automatic scale-to-zero with a one-instance maximum."
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.access]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count    = var.runtime_services_activation.enabled && var.public_ingress_activation.enabled ? 1 : 0
  name     = google_cloud_run_v2_service.public[0].name
  location = google_cloud_run_v2_service.public[0].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "admin" {
  count               = var.runtime_services_activation.enabled && var.admin_api_activation.enabled ? 1 : 0
  name                = "fsl-registration-admin"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account                  = google_service_account.admin[0].email
    timeout                          = "30s"
    max_instance_request_concurrency = 10

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.admin_image

      ports { container_port = 8080 }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = false
      }

      dynamic "env" {
        for_each = {
          APP_ENV                                 = "production"
          SERVICE_SURFACE                         = "admin"
          PHASE5_LOCAL_API_ENABLED                = "false"
          PHASE6_AUTH_API_ENABLED                 = "false"
          PHASE7_WORKER_API_ENABLED               = "false"
          PHASE7_DRIVE_API_ENABLED                = "false"
          PHASE7_DRIVE_KILL_SWITCH                = "true"
          PHASE8_ADMIN_API_ENABLED                = "true"
          PHASE8_ADMIN_ACTIVATION_CONFIRMATION    = var.admin_api_activation.confirmation
          ADMIN_MUTATIONS_ENABLED                 = tostring(var.admin_mutations_activation.enabled)
          ADMIN_MUTATIONS_ACTIVATION_CONFIRMATION = var.admin_mutations_activation.confirmation
          PHASE10A_EXPORT_API_ENABLED             = tostring(var.phase10a_export_activation.enabled)
          PHASE10A_EXPORT_ACTIVATION_CONFIRMATION = var.phase10a_export_activation.confirmation
          PHASE10A_EXPORT_MAX_ROWS                = "5000"
          PHASE10A_EXPORT_MAX_BYTES               = "10485760"
          PHASE10A_EXPORT_RATE_LIMIT_PER_HOUR     = "12"
          PHASE10A_DOWNLOAD_RETENTION_DAYS        = "30"
          EXTERNAL_SIDE_EFFECTS_ENABLED           = "false"
          PII_LOGGING_ENABLED                     = "false"
          RATE_LIMITS_ENABLED                     = "true"
          STRUCTURED_LOGGING_ENABLED              = "true"
          API_READ_ONLY_MODE                      = tostring(!(var.admin_mutations_activation.enabled || var.phase10a_export_activation.enabled))
          GOOGLE_ADMIN_OAUTH_CLIENT_IDS           = var.google_admin_oauth_client_ids
          CORS_ALLOWED_ORIGINS                    = ""
          RUNTIME_DATABASE_ROLE                   = var.admin_runtime_database_role
          MAX_REQUEST_BODY_BYTES                  = "16384"
          ADMIN_PREAUTH_RATE_LIMIT_PER_MINUTE     = tostring(var.admin_preauth_rate_limit_per_minute)
          DB_POOL_SIZE                            = "1"
          DB_MAX_OVERFLOW                         = "0"
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = {
          DATABASE_URL = {
            secret  = var.secret_ids.admin_database_url
            version = var.secret_versions.admin_database_url
          }
          GOOGLE_ADMIN_ALLOWED_EMAILS = {
            secret  = var.secret_ids.admin_allowed_emails
            version = var.secret_versions.admin_allowed_emails
          }
          LIBRARY_ADMIN_EDGE_SHARED_SECRET = {
            secret  = var.secret_ids.admin_edge_shared_secret
            version = var.secret_versions.admin_edge_shared_secret
          }
          DRIVE_OPERATION_ATTESTATION_KEY = {
            secret  = var.secret_ids.drive_operation_attestation_key
            version = var.secret_versions.drive_operation_attestation_key
          }
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        failure_threshold = 6
        period_seconds    = 5
        timeout_seconds   = 2
        http_get { path = "/health/live" }
      }
      liveness_probe {
        failure_threshold = 3
        period_seconds    = 30
        timeout_seconds   = 2
        http_get { path = "/health/live" }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_secret_manager_secret_iam_member.access]
}

resource "google_cloud_run_v2_service_iam_member" "admin_invoker" {
  count    = var.runtime_services_activation.enabled && var.admin_api_activation.enabled ? 1 : 0
  name     = google_cloud_run_v2_service.admin[0].name
  location = google_cloud_run_v2_service.admin[0].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "worker" {
  count               = var.runtime_services_activation.enabled ? 1 : 0
  name                = "fsl-registration-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  custom_audiences    = [var.worker_oidc_audience]
  deletion_protection = true

  # Keep the provider's optional service-scaling block addressable without
  # sending an explicit value that Cloud Run normalizes back to null.
  scaling {}

  template {
    service_account                  = google_service_account.worker.email
    timeout                          = "120s"
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.worker_image

      ports { container_port = 8080 }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = false
      }

      dynamic "env" {
        for_each = {
          APP_ENV                                     = "production"
          SERVICE_SURFACE                             = "worker"
          PHASE5_LOCAL_API_ENABLED                    = "false"
          PHASE6_AUTH_API_ENABLED                     = "false"
          PHASE7_WORKER_API_ENABLED                   = tostring(var.worker_drive_activation.enabled)
          PHASE7_DRIVE_API_ENABLED                    = tostring(var.worker_drive_activation.enabled)
          PHASE7_DRIVE_KILL_SWITCH                    = tostring(!var.worker_drive_activation.enabled)
          PHASE7_DRIVE_ACTIVATION_CONFIRMATION        = var.worker_drive_activation.confirmation
          PHASE7_NOTIFICATION_DELIVERY_ENABLED        = tostring(var.worker_notification_activation.enabled)
          PHASE7_NOTIFICATION_KILL_SWITCH             = tostring(!var.worker_notification_activation.enabled)
          PHASE7_NOTIFICATION_ACTIVATION_CONFIRMATION = var.worker_notification_activation.confirmation
          EXTERNAL_SIDE_EFFECTS_ENABLED               = tostring(var.worker_drive_activation.enabled)
          PII_LOGGING_ENABLED                         = "false"
          RATE_LIMITS_ENABLED                         = "true"
          STRUCTURED_LOGGING_ENABLED                  = "true"
          API_READ_ONLY_MODE                          = "false"
          WORKER_AUTH_MODE                            = "cloud_run_oidc"
          WORKER_OIDC_AUDIENCE                        = var.worker_oidc_audience
          WORKER_INVOKER_SERVICE_ACCOUNT = join(",", compact([
            google_service_account.scheduler.email,
            var.registration_event_dispatch_activation.enabled ? google_service_account.task_invoker[0].email : "",
          ]))
          RUNTIME_DATABASE_ROLE = var.worker_runtime_database_role
          WORKER_BATCH_SIZE     = "20"
          DB_POOL_SIZE          = "1"
          DB_MAX_OVERFLOW       = "0"
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "GAS_NOTIFICATION_WEBHOOK_URL"
        value = (
          var.worker_notification_activation.enabled
          ? var.gas_notification_webhook_url
          : ""
        )
      }

      dynamic "env" {
        for_each = merge({
          DATABASE_URL = {
            secret  = var.secret_ids.worker_database_url
            version = var.secret_versions.worker_database_url
          }
          DRIVE_OPERATION_ATTESTATION_KEY = {
            secret  = var.secret_ids.drive_operation_attestation_key
            version = var.secret_versions.drive_operation_attestation_key
          }
          }, var.worker_drive_activation.enabled ? {
          GOOGLE_DRIVE_OAUTH_CLIENT_ID = {
            secret  = var.secret_ids.drive_oauth_client_id
            version = var.secret_versions.drive_oauth_client_id
          }
          GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = {
            secret  = var.secret_ids.drive_oauth_client_secret
            version = var.secret_versions.drive_oauth_client_secret
          }
          GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN = {
            secret  = var.secret_ids.drive_oauth_refresh_token
            version = var.secret_versions.drive_oauth_refresh_token
          }
          DRIVE_RESOURCE_ID = {
            secret  = var.secret_ids.drive_resource_id
            version = var.secret_versions.drive_resource_id
          }
        } : {})
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        failure_threshold = 6
        period_seconds    = 5
        timeout_seconds   = 2
        # Standby Preview intentionally reports not-ready while Drive processing is off.
        # Cloud Run still needs a startup probe that proves the container is alive.
        http_get { path = "/health/live" }
      }
      liveness_probe {
        failure_threshold = 3
        period_seconds    = 30
        timeout_seconds   = 2
        http_get { path = "/health/live" }
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    # See the public service lifecycle: these are provider/API zero defaults,
    # not permission to ignore a real non-zero scaling or cost change.
    ignore_changes = [
      scaling[0].manual_instance_count,
      scaling[0].min_instance_count,
    ]

    postcondition {
      condition = (
        coalesce(try(self.scaling[0].manual_instance_count, null), 0) == 0 &&
        coalesce(try(self.scaling[0].min_instance_count, null), 0) == 0 &&
        coalesce(try(self.scaling[0].scaling_mode, null), "AUTOMATIC") == "AUTOMATIC" &&
        self.template[0].scaling[0].min_instance_count == 0 &&
        self.template[0].scaling[0].max_instance_count == 1
      )
      error_message = "The worker service must use automatic scale-to-zero with a one-instance maximum."
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.access]
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_worker_invoker" {
  count    = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled ? 1 : 0
  name     = google_cloud_run_v2_service.worker[0].name
  location = google_cloud_run_v2_service.worker[0].location
  role     = "roles/run.invoker"
  member   = google_service_account.scheduler.member
}

resource "google_cloud_run_v2_service_iam_member" "task_worker_invoker" {
  count    = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled && var.registration_event_dispatch_activation.enabled ? 1 : 0
  name     = google_cloud_run_v2_service.worker[0].name
  location = google_cloud_run_v2_service.worker[0].location
  role     = "roles/run.invoker"
  member   = google_service_account.task_invoker[0].member
}

resource "google_service_account_iam_member" "public_task_invoker_user" {
  count              = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled && var.registration_event_dispatch_activation.enabled ? 1 : 0
  service_account_id = google_service_account.task_invoker[0].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.public.member
}

resource "google_cloud_tasks_queue" "registration_events" {
  count    = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled && var.registration_event_dispatch_activation.enabled ? 1 : 0
  name     = "fsl-registration-events"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 1
    max_dispatches_per_second = 1
  }

  retry_config {
    max_attempts       = 8
    max_retry_duration = "3600s"
    min_backoff        = "5s"
    max_backoff        = "300s"
    max_doublings      = 5
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_tasks_queue_iam_member" "public_event_enqueuer" {
  count    = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled && var.registration_event_dispatch_activation.enabled ? 1 : 0
  project  = var.project_id
  location = google_cloud_tasks_queue.registration_events[0].location
  name     = google_cloud_tasks_queue.registration_events[0].name
  role     = "roles/cloudtasks.enqueuer"
  member   = google_service_account.public.member
}

resource "google_service_account_iam_member" "scheduler_oidc_minter" {
  count              = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled ? 1 : 0
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
}

resource "google_cloud_scheduler_job" "worker" {
  count            = var.runtime_services_activation.enabled && var.worker_drive_activation.enabled ? 1 : 0
  name             = "fsl-registration-worker"
  description      = "Finite Drive outbox processing; IAM/OIDC only"
  region           = var.region
  schedule         = "*/15 * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "120s"

  retry_config {
    retry_count = 0
  }

  http_target {
    uri         = "${google_cloud_run_v2_service.worker[0].uri}/phase7/internal/operations/process"
    http_method = "POST"
    body        = base64encode(jsonencode({ limit = 20 }))
    headers     = { "Content-Type" = "application/json" }

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = var.worker_oidc_audience
    }
  }

  depends_on = [
    google_cloud_run_v2_service_iam_member.scheduler_worker_invoker,
    google_service_account_iam_member.scheduler_oidc_minter,
  ]
}

resource "google_cloud_run_v2_job" "migration" {
  name                = "fsl-registration-migration"
  location            = var.region
  deletion_protection = true

  template {
    template {
      service_account = google_service_account.migration.email
      timeout         = "600s"
      max_retries     = 0

      containers {
        image = var.migration_image
        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
        dynamic "env" {
          for_each = {
            APP_ENV                             = "production"
            SERVICE_SURFACE                     = "migration"
            PII_LOGGING_ENABLED                 = "false"
            RATE_LIMITS_ENABLED                 = "true"
            PUBLIC_REGISTRATION_RPC_KEY_VERSION = var.public_registration_rpc_key_version
          }
          content {
            name  = env.key
            value = env.value
          }
        }
        env {
          name = "DATABASE_URL_UNPOOLED"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.migration_database_url
              version = var.secret_versions.migration_database_url
            }
          }
        }
        env {
          name = "PUBLIC_REGISTRATION_RPC_TOKEN"
          value_source {
            secret_key_ref {
              secret  = var.secret_ids.public_registration_rpc_token
              version = var.secret_versions.public_registration_rpc_token
            }
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition = alltrue([
        trimspace(var.secret_ids.migration_database_url) != "",
        trimspace(var.secret_ids.public_registration_rpc_token) != "",
        trimspace(var.secret_versions.migration_database_url) != "",
        trimspace(var.secret_versions.public_registration_rpc_token) != "",
      ])
      error_message = "The migration job requires pinned direct-database and public-registration RPC secret IDs and versions."
    }
    precondition {
      condition     = !var.runtime_services_activation.enabled || var.cost_guardrails_review.enabled
      error_message = "Runtime services require the reviewed near-zero cost guardrails gate before creation."
    }
    precondition {
      condition     = !var.runtime_services_activation.enabled || length(var.notification_channel_names) > 0
      error_message = "Runtime services require at least one reviewed monitoring notification channel."
    }
    precondition {
      condition = !var.runtime_services_activation.enabled || (
        trimspace(var.api_runtime_database_role) != "" &&
        trimspace(var.worker_runtime_database_role) != "" &&
        lower(trimspace(var.api_runtime_database_role)) != lower(trimspace(var.worker_runtime_database_role))
      )
      error_message = "Runtime services require separate explicit public and worker LOGIN database roles."
    }
    precondition {
      condition = !var.runtime_services_activation.enabled || alltrue([
        trimspace(var.secret_ids.api_database_url) != "",
        trimspace(var.secret_ids.worker_database_url) != "",
        trimspace(var.secret_ids.drive_operation_attestation_key) != "",
        trimspace(var.secret_versions.api_database_url) != "",
        trimspace(var.secret_versions.worker_database_url) != "",
        trimspace(var.secret_versions.drive_operation_attestation_key) != "",
      ])
      error_message = "Runtime services require pinned public, worker, and Drive-attestation secret IDs and versions."
    }
    precondition {
      condition     = !var.runtime_services_activation.enabled || length(local.registration_oauth_client_ids) > 0
      error_message = "Runtime services require at least one registration Google OAuth audience."
    }
    precondition {
      condition = !var.admin_api_activation.enabled || (
        trimspace(var.admin_runtime_database_role) != "" &&
        lower(trimspace(var.admin_runtime_database_role)) != lower(trimspace(var.api_runtime_database_role)) &&
        lower(trimspace(var.admin_runtime_database_role)) != lower(trimspace(var.worker_runtime_database_role))
      )
      error_message = "Admin API activation requires a third explicit LOGIN database role distinct from public and worker."
    }
    precondition {
      condition = !var.runtime_services_activation.enabled || alltrue([
        for value in var.notification_channel_names : startswith(value, "projects/${var.project_id}/notificationChannels/")
      ])
      error_message = "Runtime notification channels must belong to the dedicated target project."
    }
    precondition {
      condition     = !var.public_ingress_activation.enabled || var.runtime_services_activation.enabled
      error_message = "Public ingress cannot be activated before the runtime service exists."
    }
    precondition {
      condition = var.runtime_services_activation.enabled || (
        !var.public_ingress_activation.enabled &&
        !var.worker_drive_activation.enabled &&
        !var.worker_notification_activation.enabled &&
        !var.registration_event_dispatch_activation.enabled &&
        !var.admin_api_activation.enabled &&
        !var.admin_mutations_activation.enabled &&
        !var.public_api_write_activation.enabled &&
        !var.phase10a_export_activation.enabled
      )
      error_message = "Runtime-dependent capabilities must remain disabled during migration-only bootstrap."
    }
    precondition {
      condition = !var.registration_event_dispatch_activation.enabled || (
        var.runtime_services_activation.enabled &&
        var.worker_drive_activation.enabled
      )
      error_message = "Registration event dispatch requires the active runtime and Drive worker."
    }
    precondition {
      condition = !var.admin_api_activation.enabled || (
        length(local.admin_oauth_client_ids) > 0 &&
        length(setintersection(local.registration_oauth_client_ids, local.admin_oauth_client_ids)) == 0
      )
      error_message = "Admin API activation requires at least one OAuth audience separate from every registration audience."
    }
    precondition {
      condition = !var.admin_api_activation.enabled || alltrue([
        trimspace(var.admin_image) != "",
        trimspace(var.secret_ids.admin_database_url) != "",
        trimspace(var.secret_ids.admin_allowed_emails) != "",
        trimspace(var.secret_ids.admin_edge_shared_secret) != "",
        trimspace(var.secret_versions.admin_database_url) != "",
        trimspace(var.secret_versions.admin_allowed_emails) != "",
        trimspace(var.secret_versions.admin_edge_shared_secret) != "",
      ])
      error_message = "Admin API activation requires its immutable image plus pinned database, allowlist, and edge-secret IDs and versions."
    }
    precondition {
      condition     = !var.runtime_services_activation.enabled || trimspace(var.secret_ids.drive_operation_attestation_key) != ""
      error_message = "Runtime services require a dedicated Drive operation attestation Secret Manager ID."
    }
    precondition {
      condition = !var.worker_drive_activation.enabled || alltrue([
        trimspace(var.secret_ids.drive_oauth_client_id) != "",
        trimspace(var.secret_ids.drive_oauth_client_secret) != "",
        trimspace(var.secret_ids.drive_oauth_refresh_token) != "",
        trimspace(var.secret_ids.drive_resource_id) != "",
        trimspace(var.secret_versions.drive_oauth_client_id) != "",
        trimspace(var.secret_versions.drive_oauth_client_secret) != "",
        trimspace(var.secret_versions.drive_oauth_refresh_token) != "",
        trimspace(var.secret_versions.drive_resource_id) != "",
      ])
      error_message = "Drive activation requires pinned OAuth client, refresh-token, and resource-ID secret IDs and versions."
    }
    precondition {
      condition = !var.worker_notification_activation.enabled || (
        var.worker_drive_activation.enabled &&
        trimspace(var.gas_notification_webhook_url) != ""
      )
      error_message = "GAS notifications require the active Drive worker and one private reviewed webhook URL."
    }
    precondition {
      condition = var.worker_notification_activation.enabled || (
        trimspace(var.gas_notification_webhook_url) == ""
      )
      error_message = "The GAS webhook URL must remain absent while notification delivery is disabled."
    }
    precondition {
      condition     = !var.admin_mutations_activation.enabled || var.admin_api_activation.enabled
      error_message = "Admin mutation activation requires the production admin API to be activated first."
    }
    precondition {
      condition     = !var.phase10a_export_activation.enabled || var.admin_api_activation.enabled
      error_message = "Phase 10A export activation requires the production admin API to be activated first."
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.access]
}
