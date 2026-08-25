# GKE Autopilot and Cloud SQL reference

This Terraform root is a complete, opinionated reference for a private go-router deployment on Google Cloud. It creates billable resources; review a saved plan before applying it.

## What it creates

- A custom VPC, GKE subnet with Pod/Service secondary ranges, Cloud Router, and Cloud NAT for private-node egress.
- A regional private-node GKE Autopilot cluster with Workload Identity Federation.
- Private service networking and a private-IP PostgreSQL 16 Cloud SQL instance with explicit Enterprise edition, backups, and point-in-time recovery.
- A Google service account with `roles/cloudsql.client`, bound to a pre-created Kubernetes ServiceAccount.
- A reserved internal address, private Cloud DNS zone/record, database Secret, and local Helm chart release.
- Optionally, an empty regional Artifact Registry Docker repository.

The default frontend is an internal L4 LoadBalancer Service over HTTP. Supplying `tls_secret_name` switches to an internal GKE Ingress, creates its required proxy-only subnet and proxy-to-Pod firewall rule, associates the reserved regional internal IP by name, and disables HTTP. The TLS Secret must exist in the application namespace before apply.

## Prerequisites

- Terraform 1.8 or newer, Google Cloud CLI, `kubectl`, and Helm.
- A Google Cloud project with billing enabled and permission to enable APIs, create networking/GKE/Cloud SQL/DNS resources, manage IAM, and write Kubernetes resources.
- A published go-router image in public GHCR, or an image pushed to the optional Artifact Registry repository.
- A private FQDN and DNS suffix you control. The created zone must not conflict with an existing Cloud DNS zone.

Authenticate application-default credentials:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project MY_PROJECT
```

## Apply

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit project_id, private_fqdn, private_dns_zone, and image_repository.
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

The Google, Kubernetes, and Helm providers are intentionally in one reference root for an end-to-end example. On a completely new project, provider initialization can occur before the new cluster is reachable. If that happens, bootstrap the cluster once, then run a normal reviewed plan:

```sh
terraform apply -target=google_container_cluster.main
terraform plan -out=tfplan
terraform apply tfplan
```

Use targeting only for this bootstrap case; the second full apply reconciles every dependency.

Get cluster credentials and inspect the rollout with the commands from Terraform outputs:

```sh
terraform output -raw get_credentials_command
kubectl --namespace go-router get pods,service,ingress
```

## Artifact Registry option

Artifact Registry is off by default; tagged releases publish multi-architecture images to GHCR, intended for public use after the one-time package visibility step in [CONTRIBUTING.md](../../CONTRIBUTING.md#publishing-a-release). If `enable_artifact_registry=true`, Terraform creates an empty repository and configures the deployment to use it. Populate the requested `image_tag` before Helm installs:

```sh
terraform apply -target=google_artifact_registry_repository.application
gcloud auth configure-docker REGION-docker.pkg.dev
docker build --tag REGION-docker.pkg.dev/PROJECT/go-router/go-router:TAG ../..
docker push REGION-docker.pkg.dev/PROJECT/go-router/go-router:TAG
terraform plan -out=tfplan
terraform apply tfplan
```

The first targeted apply is only a repository bootstrap. Always follow it with a full plan and apply.

## Private access and DNS

Autopilot nodes have private addresses. Cloud NAT lets them pull GHCR images and reach package/Supabase endpoints without accepting unsolicited inbound internet traffic. Cloud SQL traffic stays on private service networking through the Auth Proxy.

The Cloud DNS zone is visible only from the VPC. On-premises or employee clients need VPN/interconnect connectivity and DNS forwarding into Cloud DNS. To make a bare `go` name resolve, distribute the private zone as a client DNS search suffix; see [DNS and browser setup](../../docs/dns-and-browser.md).

## TLS

The default is internal HTTP. To use the optional internal GKE Ingress on a new stack, first apply the default stack, fetch cluster credentials, create the TLS Secret in the generated namespace, then set `tls_secret_name` and apply a new reviewed plan:

```sh
kubectl --namespace go-router create secret tls go-router-tls \
  --cert=go.corp.example.crt \
  --key=go.corp.example.key
```

The second apply replaces the L4 frontend address with the reserved internal Ingress address and updates private DNS. The chart adds the mandatory `kubernetes.io/ingress.class: gce-internal` and `kubernetes.io/ingress.regional-static-ip-name` annotations. The Secret should contain a certificate issued for `private_fqdn` by a CA trusted by client devices.

## State and credentials

`random_password`, `google_sql_user`, and `kubernetes_secret_v1` put the generated database password in Terraform state. Store state in an encrypted remote backend with versioning, locking, tightly scoped IAM, and audit logging. The example intentionally does not prescribe a backend because backend ownership is organization-specific.

Both GKE and Cloud SQL deletion protection default to true. To intentionally tear down the reference stack, set `cluster_deletion_protection=false` and `database_deletion_protection=false`, apply that change, and only then destroy the remaining resources.

For production, also consider `database_availability_type="REGIONAL"`, organization-specific backup retention, alerting, authorized control-plane networks, network policy, and a deliberate certificate lifecycle.
