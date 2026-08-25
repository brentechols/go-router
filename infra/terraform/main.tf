locals {
  fqdn              = trimsuffix(var.private_fqdn, ".")
  dns_suffix        = trimsuffix(var.private_dns_zone, ".")
  database_name     = "go_router"
  database_user     = "go_router"
  ksa_name          = var.name
  connection_name   = google_sql_database_instance.main.connection_name
  artifact_image    = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository_id}/go-router"
  selected_image    = var.enable_artifact_registry ? local.artifact_image : var.image_repository
  database_password = random_password.database.result
  database_url      = "postgresql://${local.database_user}:${urlencode(local.database_password)}@127.0.0.1:5432/${local.database_name}?sslmode=disable"
  service_address   = var.tls_secret_name == "" ? google_compute_address.service[0].address : google_compute_address.ingress[0].address
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each = toset(concat([
    "compute.googleapis.com",
    "container.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "dns.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
  ], var.enable_artifact_registry ? ["artifactregistry.googleapis.com"] : []))

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_compute_network" "main" {
  name                    = "${var.name}-network"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "main" {
  name                     = "${var.name}-${var.region}"
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = var.network_cidr
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "${var.name}-pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "${var.name}-services"
    ip_cidr_range = var.services_cidr
  }
}

resource "google_compute_subnetwork" "proxy_only" {
  count = var.tls_secret_name == "" ? 0 : 1

  name          = "${var.name}-proxy-only"
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.proxy_only_cidr
  purpose       = "REGIONAL_MANAGED_PROXY"
  role          = "ACTIVE"
}

resource "google_compute_firewall" "allow_ingress_proxy" {
  count = var.tls_secret_name == "" ? 0 : 1

  name          = "${var.name}-allow-ingress-proxy"
  network       = google_compute_network.main.name
  direction     = "INGRESS"
  source_ranges = [var.proxy_only_cidr]

  allow {
    protocol = "tcp"
    ports    = ["3000"]
  }

  depends_on = [google_compute_subnetwork.proxy_only]
}

resource "google_compute_router" "main" {
  name    = "${var.name}-nat-router"
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.name}-nat"
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

resource "google_compute_global_address" "private_services" {
  name          = "${var.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]

  depends_on = [google_project_service.required]
}

resource "google_container_cluster" "main" {
  name                     = var.name
  location                 = var.region
  enable_autopilot         = true
  network                  = google_compute_network.main.id
  subnetwork               = google_compute_subnetwork.main.id
  deletion_protection      = var.cluster_deletion_protection
  enable_l4_ilb_subsetting = true

  release_channel {
    channel = var.gke_release_channel
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = "${var.name}-pods"
    services_secondary_range_name = "${var.name}-services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_ipv4_cidr
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  depends_on = [google_project_service.required]
}

resource "google_sql_database_instance" "main" {
  name                = var.name
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.database_deletion_protection

  settings {
    edition                     = "ENTERPRISE"
    tier                        = var.database_tier
    availability_type           = var.database_availability_type
    deletion_protection_enabled = var.database_deletion_protection
    disk_type                   = "PD_SSD"
    disk_autoresize             = true
    user_labels                 = var.labels

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = var.database_backup_start_time
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true
    }

    maintenance_window {
      day          = 7
      hour         = 4
      update_track = "stable"
    }
  }

  depends_on = [
    google_project_service.required,
    google_service_networking_connection.private_services,
  ]
}

resource "google_sql_database" "main" {
  name     = local.database_name
  instance = google_sql_database_instance.main.name
}

resource "random_password" "database" {
  length  = 32
  special = true
}

resource "google_sql_user" "application" {
  name     = local.database_user
  instance = google_sql_database_instance.main.name
  password = local.database_password
}

resource "google_service_account" "application" {
  account_id   = var.name
  display_name = "go-router GKE workload"
}

resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.application.email}"
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.application.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.namespace}/${local.ksa_name}]"

  depends_on = [google_container_cluster.main]
}

resource "google_compute_address" "service" {
  count = var.tls_secret_name == "" ? 1 : 0

  name         = "${var.name}-internal"
  region       = var.region
  address_type = "INTERNAL"
  purpose      = "SHARED_LOADBALANCER_VIP"
  subnetwork   = google_compute_subnetwork.main.id
}

resource "google_compute_address" "ingress" {
  count = var.tls_secret_name == "" ? 0 : 1

  name         = "${var.name}-ingress"
  region       = var.region
  address_type = "INTERNAL"
  purpose      = "GCE_ENDPOINT"
  subnetwork   = google_compute_subnetwork.main.id
}

resource "google_dns_managed_zone" "private" {
  name        = "${var.name}-private"
  dns_name    = "${local.dns_suffix}."
  description = "Private go-router DNS zone"
  visibility  = "private"
  labels      = var.labels

  private_visibility_config {
    networks {
      network_url = google_compute_network.main.id
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_dns_record_set" "service" {
  name         = "${local.fqdn}."
  managed_zone = google_dns_managed_zone.private.name
  type         = "A"
  ttl          = 60
  rrdatas      = [local.service_address]

  lifecycle {
    precondition {
      condition     = local.fqdn == local.dns_suffix || endswith(local.fqdn, ".${local.dns_suffix}")
      error_message = "private_fqdn must equal private_dns_zone or be a hostname beneath it."
    }
  }
}

resource "google_artifact_registry_repository" "application" {
  count = var.enable_artifact_registry ? 1 : 0

  location      = var.region
  repository_id = var.artifact_registry_repository_id
  description   = "Optional go-router container repository"
  format        = "DOCKER"
  labels        = var.labels

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "artifact_registry_reader" {
  count = var.enable_artifact_registry ? 1 : 0

  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "kubernetes_namespace_v1" "application" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/name"       = "go-router"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  depends_on = [google_container_cluster.main]
}

resource "kubernetes_service_account_v1" "application" {
  metadata {
    name      = local.ksa_name
    namespace = kubernetes_namespace_v1.application.metadata[0].name
    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.application.email
    }
  }

  depends_on = [google_service_account_iam_member.workload_identity]
}

resource "kubernetes_secret_v1" "database" {
  metadata {
    name      = "${var.name}-database"
    namespace = kubernetes_namespace_v1.application.metadata[0].name
  }

  data = {
    DATABASE_URL           = local.database_url
    MIGRATION_DATABASE_URL = local.database_url
  }

  type = "Opaque"

  depends_on = [
    google_sql_database.main,
    google_sql_user.application,
  ]
}

resource "helm_release" "application" {
  name        = var.name
  namespace   = kubernetes_namespace_v1.application.metadata[0].name
  chart       = "${path.module}/../../deploy/helm/go-router"
  atomic      = true
  wait        = true
  timeout     = 900
  max_history = 10

  values = [yamlencode({
    image = {
      repository = local.selected_image
      tag        = var.image_tag
    }
    serviceAccount = {
      create = false
      name   = kubernetes_service_account_v1.application.metadata[0].name
    }
    database = {
      existingSecret             = kubernetes_secret_v1.database.metadata[0].name
      existingSecretKey          = "DATABASE_URL"
      migrationExistingSecretKey = "MIGRATION_DATABASE_URL"
      rolloutChecksum            = sha256(local.database_url)
    }
    migrations = {
      serviceAccountName = kubernetes_service_account_v1.application.metadata[0].name
    }
    cloudSqlProxy = {
      enabled        = true
      connectionName = local.connection_name
      privateIP      = true
    }
    config = {
      publicBaseUrl = "${var.tls_secret_name != "" ? "https" : "http"}://${local.fqdn}"
      trustProxy    = true
    }
    service = {
      type = var.tls_secret_name == "" ? "LoadBalancer" : "ClusterIP"
      annotations = var.tls_secret_name == "" ? {
        "networking.gke.io/load-balancer-type"         = "Internal"
        "networking.gke.io/load-balancer-ip-addresses" = google_compute_address.service[0].name
        } : {
        # Internal GKE Ingress requires a zonal GCE_VM_IP_PORT NEG backend.
        "cloud.google.com/neg" = jsonencode({ ingress = true })
      }
      loadBalancerIP = ""
    }
    ingress = {
      enabled   = var.tls_secret_name != ""
      className = ""
      annotations = var.tls_secret_name == "" ? {} : {
        "kubernetes.io/ingress.allow-http"              = "false"
        "kubernetes.io/ingress.class"                   = "gce-internal"
        "kubernetes.io/ingress.regional-static-ip-name" = google_compute_address.ingress[0].name
      }
      hosts = [{
        host = local.fqdn
        paths = [{
          path     = "/"
          pathType = "Prefix"
        }]
      }]
      tls = var.tls_secret_name == "" ? [] : [{
        secretName = var.tls_secret_name
        hosts      = [local.fqdn]
      }]
    }
  })]

  depends_on = [
    google_artifact_registry_repository.application,
    google_project_iam_member.cloud_sql_client,
    kubernetes_secret_v1.database,
    kubernetes_service_account_v1.application,
    google_compute_firewall.allow_ingress_proxy,
    google_compute_router_nat.main,
    google_compute_subnetwork.proxy_only,
  ]
}
