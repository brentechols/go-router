output "cluster_name" {
  description = "Regional GKE Autopilot cluster name."
  value       = google_container_cluster.main.name
}

output "cluster_region" {
  description = "GKE cluster region."
  value       = google_container_cluster.main.location
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name used by the Auth Proxy."
  value       = google_sql_database_instance.main.connection_name
}

output "cloud_sql_private_ip" {
  description = "Private address assigned to Cloud SQL."
  value       = google_sql_database_instance.main.private_ip_address
}

output "service_internal_ip" {
  description = "Reserved internal service address."
  value       = local.service_address
}

output "service_url" {
  description = "Private go-router URL."
  value       = "${var.tls_secret_name != "" ? "https" : "http"}://${local.fqdn}"
}

output "artifact_registry_image" {
  description = "Image repository to populate when optional Artifact Registry is enabled."
  value       = var.enable_artifact_registry ? local.artifact_image : null
}

output "get_credentials_command" {
  description = "Command that configures kubectl for the new cluster."
  value       = "gcloud container clusters get-credentials ${google_container_cluster.main.name} --region ${var.region} --project ${var.project_id}"
}

output "database_password_state_warning" {
  description = "Reminder about generated credentials."
  value       = "The generated Cloud SQL password and Kubernetes Secret are sensitive values stored in Terraform state; use an encrypted remote backend with tightly scoped access."
}
