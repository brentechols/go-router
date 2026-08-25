# Supabase PostgreSQL quickstart

go-router uses Supabase only as PostgreSQL; it does not need Supabase Auth, Storage, Realtime, or a browser key. Keep the database URL on the server.

## Choose connection endpoints

From the Supabase dashboard's **Connect** panel, copy:

- A direct database URL for `MIGRATION_DATABASE_URL` when the deploy environment has IPv6 reachability.
- A persistent runtime URL for `DATABASE_URL`. On an IPv4-only GKE network, use Supavisor **session mode** rather than the direct IPv6 endpoint. Session mode is appropriate for a long-lived server and supports prepared statements.

Both URLs should require TLS. Replace bracketed dashboard placeholders with the database password and percent-encode special characters inside the URL.

For small deployments, set `DB_POOL_MAX` conservatively (for example 5 per replica) so `replicas × DB_POOL_MAX` stays below the project or pooler connection limit.

## Run migrations

From a checkout:

```sh
export DATABASE_URL='postgresql://...'
export MIGRATION_DATABASE_URL='postgresql://...'
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm start
```

The migration creates the private schemas, tables, and `pg_trgm` extension. Use a Supabase database owner connection for migration privileges; use a more restricted role for runtime if you manage grants separately.

## Deploy with Helm

Create both keys before the chart's pre-install hook runs:

```sh
kubectl create namespace go-router
kubectl --namespace go-router create secret generic go-router-supabase \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=MIGRATION_DATABASE_URL="$MIGRATION_DATABASE_URL"

helm upgrade --install go-router deploy/helm/go-router \
  --namespace go-router \
  --values deploy/helm/go-router/values-supabase.yaml \
  --set image.repository=ghcr.io/ORG/go-router \
  --set image.tag=0.1.0
```

Do not commit the filled connection strings or pass them through Terraform unless its encrypted remote state and access controls are acceptable for database credentials.

See Supabase's current [Postgres connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) for direct, session, and transaction pooler behavior.
