# Docker and Helm deployment

## Container image

The multi-stage Dockerfile builds the React assets and Fastify bundles on Node.js 24, prunes development packages, and runs as UID/GID 10001.

```sh
docker build --tag go-router:local .
docker run --rm --publish 3000:3000 \
  --env DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/go_router \
  --env PUBLIC_BASE_URL=http://localhost:3000 \
  go-router:local node dist/server/migrate.js

docker run --rm --publish 3000:3000 \
  --env DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/go_router \
  --env PUBLIC_BASE_URL=http://localhost:3000 \
  go-router:local
```

Use a secret manager rather than command-line environment values in production.

## Generic Helm install

The chart requires Kubernetes 1.29 or newer. First create a database secret:

```sh
kubectl create namespace go-router
kubectl --namespace go-router create secret generic go-router-database \
  --from-literal=DATABASE_URL='postgresql://go_router:password@postgres.example:5432/go_router?sslmode=require' \
  --from-literal=MIGRATION_DATABASE_URL='postgresql://go_router:password@postgres-direct.example:5432/go_router?sslmode=require'
```

Install a published OCI chart:

```sh
helm upgrade --install go-router oci://ghcr.io/ORG/charts/go-router \
  --namespace go-router \
  --set image.repository=ghcr.io/ORG/go-router \
  --set image.tag=0.1.0 \
  --set database.existingSecret=go-router-database \
  --set config.publicBaseUrl=https://go.corp.example
```

Or install from a checkout with `deploy/helm/go-router` as the chart argument.

The chart supports:

- Deployment, Service, ServiceAccount, probes, resources, HPA, PodDisruptionBudget, and Ingress.
- A `pre-install,pre-upgrade` migration hook. The application migrator serializes jobs with a PostgreSQL advisory lock.
- Existing Secrets or an inline database URL. Existing Secrets are strongly preferred.
- An optional Cloud SQL Auth Proxy sidecar for both application Pods and migration jobs.

Kubernetes does not restart Pods when data in an externally managed Secret changes. When `database.existingSecret` is used, also set `database.rolloutChecksum` to an opaque value and change it with every credential rotation. The value itself must not be the credential; a SHA-256 digest or rotation identifier is sufficient. For example:

```sh
helm upgrade go-router oci://ghcr.io/ORG/charts/go-router \
  --namespace go-router \
  --reuse-values \
  --set-string database.rolloutChecksum=2026-08-rotation-2
```

Chart-managed inline Secrets are checksummed automatically. The Terraform reference passes `sha256(local.database_url)`, so a generated database-password change updates the Pod template and rolls the Deployment.

Pre-install hooks run before chart-managed resources. Therefore an `existingSecret`, image pull secret, or Workload Identity ServiceAccount used by the migration job must already exist. `migrations.serviceAccountName` defaults to the namespace's `default` account; set it to a pre-created annotated ServiceAccount in Cloud SQL mode. The Terraform reference handles this ordering.

For a direct external PostgreSQL connection, start with [values-supabase.yaml](../deploy/helm/go-router/values-supabase.yaml). For a pre-provisioned Cloud SQL instance, start with [values-cloud-sql.yaml](../deploy/helm/go-router/values-cloud-sql.yaml).

## Cloud SQL proxy mode

Set `cloudSqlProxy.enabled=true`, its `project:region:instance` connection name, and a database URL whose host is `127.0.0.1`. The Kubernetes ServiceAccount needs Workload Identity access to a Google service account with `roles/cloudsql.client`.

The chart uses Cloud SQL Auth Proxy 2.25.3 and private IP by default. Pin changes intentionally and review upstream release notes. Migration proxy containers use health-gated Kubernetes native sidecars, which is why the chart declares Kubernetes 1.29 as its minimum.

## Upgrade and rollback

Use immutable application image tags. Helm runs migrations before an upgrade, waits for readiness, and keeps up to ten release revisions in the Terraform reference. Database migrations should be backwards compatible with the immediately preceding application version; Helm can roll back Pods, but it does not reverse database migrations.

`/healthz` is a process liveness probe. `/readyz` checks database readiness and removes an unhealthy replica from service.
