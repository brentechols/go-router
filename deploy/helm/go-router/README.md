# go-router Helm chart

This chart deploys the combined API/manager image and runs committed database migrations as a Helm hook. Kubernetes 1.29+ is required for the native sidecar lifecycle used by Cloud SQL migration jobs.

## Required values

- `image.repository` and an immutable `image.tag`
- `config.publicBaseUrl`
- Either `database.existingSecret` or `database.url`

An existing database Secret must contain `DATABASE_URL` and `MIGRATION_DATABASE_URL` by default. Override the key names with `database.existingSecretKey` and `database.migrationExistingSecretKey`.

The chart cannot observe changes to an externally managed Secret's data. Set `database.rolloutChecksum` to a digest or rotation identifier and change it whenever that Secret rotates; this changes the Pod template and rolls the Deployment. Do not place the credential itself in the checksum value. Inline chart-managed Secrets are checksummed automatically.

```sh
helm upgrade --install go-router ./deploy/helm/go-router \
  --namespace go-router --create-namespace \
  --set image.repository=ghcr.io/ORG/go-router \
  --set image.tag=0.1.0 \
  --set database.existingSecret=go-router-database \
  --set config.publicBaseUrl=https://go.corp.example
```

See [the deployment guide](../../../docs/deployment.md) for secret bootstrap ordering, Cloud SQL, and upgrade behavior. Example values cover [external/Supabase PostgreSQL](values-supabase.yaml) and [Cloud SQL](values-cloud-sql.yaml).
