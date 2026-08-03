output "public_api_url" {
  description = "Use this exact origin for the frontend API setting and CSP after approval."
  value       = try(google_cloud_run_v2_service.public[0].uri, null)
}

output "admin_api_url" {
  description = "Set this exact HTTPS origin only in the Cloudflare Pages server-side LIBRARY_ADMIN_API_ORIGIN variable."
  value       = try(google_cloud_run_v2_service.admin[0].uri, null)
}

output "worker_url" {
  description = "Private request URI; Scheduler authentication uses the separately configured custom audience."
  value       = try(google_cloud_run_v2_service.worker[0].uri, null)
}

output "migration_job_name" {
  value = google_cloud_run_v2_job.migration.name
}
