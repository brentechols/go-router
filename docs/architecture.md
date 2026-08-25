# Architecture

go-router is one deployable TypeScript package:

```text
browser ──HTTP──> Fastify ──SQL──> PostgreSQL
                  │
                  └── serves Vite-built React assets
```

Fastify owns redirects, the versioned API, OpenAPI, static assets, and health checks. React Router and TanStack Query power the `/admin` manager. Shared Zod schemas and the template parser run on both sides, so forms can preview the same validation enforced by the API.

## Data model

Objects live in a private `go_router` PostgreSQL schema:

- `routes` holds a bigint identity, destination template, description, tags, aggregate hit count, last-used time, and timestamps.
- `route_names` holds canonical names and aliases. A globally unique normalized lookup key prevents collisions, and a partial unique index enforces one canonical name per route.

`pg_trgm` indexes provide fuzzy search and suggestions; a GIN index supports tag filters. Foreign keys cascade names when a route is hard-deleted.

Create, upsert, rename, and alias edits use short transactions. Redirect resolution performs a lookup and then atomically increments aggregate usage. A metrics-update failure is logged but does not turn a valid redirect into an error.

## Runtime and releases

The production container runs as an unprivileged numeric user and contains compiled server modules, static assets, production dependencies, and committed SQL migrations. Every replica is stateless; PostgreSQL is the sole durable service.

Migrations are an explicit release action. The migration process takes a PostgreSQL advisory lock, applies committed Drizzle migrations, and exits. Docker Compose and Helm run that command once before the application rolls forward.

The Helm Cloud SQL mode places the Auth Proxy beside each application Pod. Migration jobs use the Kubernetes native sidecar lifecycle (`initContainers[*].restartPolicy: Always`) so the proxy starts first and stops after the migrator exits.

## Trust boundary

There are no users or permissions in v1. The network is the authorization boundary. Deploy behind an internal load balancer or an authenticated gateway if editor-level access is not appropriate for everyone with network reachability.
