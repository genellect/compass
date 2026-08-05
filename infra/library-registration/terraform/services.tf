locals {
  required_service_apis = toset(concat(
    [
      "artifactregistry.googleapis.com",
      "logging.googleapis.com",
      "monitoring.googleapis.com",
      "run.googleapis.com",
      "secretmanager.googleapis.com",
    ],
    var.runtime_services_activation.enabled && var.worker_drive_activation.enabled ? [
      "cloudscheduler.googleapis.com",
      "drive.googleapis.com",
      "iamcredentials.googleapis.com",
    ] : [],
    var.registration_event_dispatch_activation.enabled ? [
      "cloudtasks.googleapis.com",
    ] : [],
  ))
}

resource "google_project_service" "required" {
  for_each           = local.required_service_apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
