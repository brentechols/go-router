variable "project_id" {
  description = "Google Cloud project in which to create the stack."
  type        = string
}

variable "region" {
  description = "Region for GKE, Cloud SQL, and the internal address."
  type        = string
  default     = "us-central1"
}

variable "name" {
  description = "Prefix used for resource names."
  type        = string
  default     = "go-router"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,28}[a-z0-9]$", var.name))
    error_message = "name must be a 3-30 character lowercase GCP resource prefix."
  }
}

variable "private_fqdn" {
  description = "Private fully-qualified hostname for the service, for example go.corp.example."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\\.?$", var.private_fqdn))
    error_message = "private_fqdn must be a fully-qualified DNS name with at least one dot."
  }
}

variable "private_dns_zone" {
  description = "Private DNS suffix to create and attach to the VPC, for example corp.example."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\\.?$", var.private_dns_zone))
    error_message = "private_dns_zone must be a DNS suffix with at least one dot."
  }
}

variable "network_cidr" {
  description = "Primary subnet CIDR."
  type        = string
  default     = "10.20.0.0/20"
}

variable "pods_cidr" {
  description = "Secondary CIDR used by GKE Pods."
  type        = string
  default     = "10.24.0.0/14"
}

variable "services_cidr" {
  description = "Secondary CIDR used by GKE Services."
  type        = string
  default     = "10.20.16.0/20"
}

variable "proxy_only_cidr" {
  description = "Proxy-only subnet used when the optional internal GKE Ingress is enabled."
  type        = string
  default     = "10.20.32.0/23"
}

variable "master_ipv4_cidr" {
  description = "CIDR used by the private GKE control-plane peering."
  type        = string
  default     = "172.16.0.0/28"
}

variable "gke_release_channel" {
  description = "Autopilot release channel."
  type        = string
  default     = "REGULAR"
}

variable "cluster_deletion_protection" {
  description = "Protect the GKE cluster against accidental deletion."
  type        = bool
  default     = true
}

variable "database_tier" {
  description = "Cloud SQL Enterprise machine tier."
  type        = string
  default     = "db-custom-1-3840"
}

variable "database_availability_type" {
  description = "Use REGIONAL for HA or ZONAL for a lower-cost reference deployment."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.database_availability_type)
    error_message = "database_availability_type must be ZONAL or REGIONAL."
  }
}

variable "database_deletion_protection" {
  description = "Protect the Cloud SQL instance against accidental deletion."
  type        = bool
  default     = true
}

variable "database_backup_start_time" {
  description = "UTC start time for automated database backups."
  type        = string
  default     = "03:00"
}

variable "namespace" {
  description = "Kubernetes namespace for go-router."
  type        = string
  default     = "go-router"
}

variable "image_repository" {
  description = "Public container repository used when Artifact Registry creation is disabled."
  type        = string
  default     = "ghcr.io/brentechols/go-router"
}

variable "image_tag" {
  description = "Immutable application image tag to deploy."
  type        = string
  default     = "0.1.0"
}

variable "enable_artifact_registry" {
  description = "Create a regional Docker Artifact Registry repository and deploy from it. Images are not copied automatically."
  type        = bool
  default     = false
}

variable "artifact_registry_repository_id" {
  description = "Artifact Registry repository name when enabled."
  type        = string
  default     = "go-router"
}

variable "tls_secret_name" {
  description = "Optional pre-existing Kubernetes TLS secret. When set, the chart creates an Ingress instead of an internal LoadBalancer service."
  type        = string
  default     = ""
}

variable "labels" {
  description = "Labels applied to supported Google Cloud resources."
  type        = map(string)
  default = {
    app        = "go-router"
    managed-by = "terraform"
  }
}
