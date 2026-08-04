# Cloud Billing budgets are intentionally not declared here. The Cloud Run
# spend-cap budget is a Preview control and the project-wide budget is
# alerts-only; both are configured and evidenced in the Billing console before
# cost_guardrails_review can be enabled. That variable is an operator
# attestation only and must never be reported as Terraform-provisioned control.

resource "google_logging_metric" "public_server_error" {
  count       = var.runtime_services_activation.enabled ? 1 : 0
  name        = "fsl_registration_public_5xx"
  description = "PII-free count of public API 5xx responses"
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"fsl-registration-public\" AND jsonPayload.event=\"http_request\" AND jsonPayload.status>=500"
  depends_on  = [google_project_service.required]
}

resource "google_logging_metric" "dead_operation" {
  count       = var.runtime_services_activation.enabled ? 1 : 0
  name        = "fsl_registration_dead_operation"
  description = "PII-free count of Drive operations reaching dead state"
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"fsl-registration-worker\" AND jsonPayload.event=\"drive_operation_dead\""
  depends_on  = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "public_server_error" {
  count                 = var.runtime_services_activation.enabled && length(var.notification_channel_names) > 0 ? 1 : 0
  display_name          = "FSL registration public API 5xx"
  combiner              = "OR"
  notification_channels = var.notification_channel_names

  conditions {
    display_name = "At least three 5xx responses in five minutes"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.public_server_error[0].name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "dead_operation" {
  count                 = var.runtime_services_activation.enabled && length(var.notification_channel_names) > 0 ? 1 : 0
  display_name          = "FSL registration dead Drive operation"
  combiner              = "OR"
  notification_channels = var.notification_channel_names

  conditions {
    display_name = "Any Drive operation entered dead state"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.dead_operation[0].name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}
