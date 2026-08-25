# go-router

An open-source, self-hosted service for memorable internal links. Create `go/docs`, point it at a long URL, and let your team find it again without a bookmark hunt.

> go-router is an independent project. It is not affiliated with, endorsed by, or sponsored by GoLinks, Inc. or golinks.io. “GoLinks” may be a trademark of its respective owner.

go-router keeps the useful core small: one TypeScript service, one React manager, and PostgreSQL. It is designed for a trusted internal network and intentionally does **not** include authentication, SSO, per-user ownership, audit logs, visibility policies, or other enterprise controls.

## What it includes

- Fast redirects through names and aliases, with normalized collision detection (`all-hands`, `all_hands`, and `allhands` collide).
- Required, optional, and defaulted URL-template arguments with safe component encoding.
- Path, repeated-query, and browser custom-search entrypoints.
- A responsive React manager for search, filters, create, preview, edit, aliases, and deletion.
- Versioned JSON API, generated OpenAPI, health probes, and fuzzy suggestions.
- PostgreSQL migrations, Docker Compose, a generic Helm chart, and a GKE Autopilot/Cloud SQL Terraform reference.

## Quick start

Docker Compose is the shortest path to a complete local stack:

```sh
git clone https://github.com/brentechols/go-router.git
cd go-router
docker compose up --build
```

Open the manager at [http://localhost:3000/admin](http://localhost:3000/admin) and API documentation at [http://localhost:3000/api/docs](http://localhost:3000/api/docs). PostgreSQL data persists in the `postgres-data` volume.

Create a route from a second terminal:

```sh
curl --request POST http://localhost:3000/api/v1/routes \
  --header "content-type: application/json" \
  --data '{"name":"gh","aliases":["github"],"destinationTemplate":"https://github.com/{*}","description":"Open a GitHub repository","tags":["engineering"]}'
```

Then request `http://localhost:3000/gh/openai/codex`. The response is a temporary, non-cacheable redirect to `https://github.com/openai/codex`.

For local application development:

```sh
corepack enable
pnpm install
docker compose up -d postgres
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Vite serves the manager on port 5173 and proxies application requests to Fastify on port 3000. `pnpm build && pnpm start` runs the combined production service.

## Configuration

| Variable                  | Default               | Purpose                                                       |
| ------------------------- | --------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`            | required              | Runtime PostgreSQL connection string.                         |
| `MIGRATION_DATABASE_URL`  | `DATABASE_URL`        | Direct/session connection used only by the migration command. |
| `PUBLIC_BASE_URL`         | `http://go.localhost` | Canonical external origin, with no trailing path.             |
| `PORT`                    | `3000`                | HTTP port.                                                    |
| `HOST`                    | `0.0.0.0`             | HTTP bind address.                                            |
| `LOG_LEVEL`               | `info`                | Fastify/Pino log level.                                       |
| `TRUST_PROXY`             | `false`               | Trust forwarding headers; enable only behind a known proxy.   |
| `DB_POOL_MAX`             | `10`                  | Maximum runtime PostgreSQL connections per replica.           |
| `DB_IDLE_TIMEOUT_SECONDS` | `20`                  | Idle connection lifetime.                                     |

Run migrations explicitly before starting or upgrading replicas:

```sh
pnpm db:migrate       # source checkout
pnpm migrate          # compiled production build
```

The migrator uses a PostgreSQL advisory lock, so concurrent release jobs serialize. Application startup never applies migrations.

## Documentation

- [API reference](docs/api.md)
- [URL templates and argument input](docs/templates.md)
- [Architecture](docs/architecture.md)
- [Docker and Helm deployment](docs/deployment.md)
- [Supabase quickstart](docs/supabase.md)
- [GKE and Cloud SQL Terraform reference](infra/terraform/README.md)
- [DNS and browser setup](docs/dns-and-browser.md)
- [Contributing](CONTRIBUTING.md)

## Security posture

Version 1 has no authentication or authorization. Anyone who can reach the service can list, create, change, or delete routes. Put it behind a trusted network boundary, internal load balancer, VPN, or authenticated reverse proxy. Do not expose it directly to the public internet.

Route destinations are limited to absolute HTTP(S) URLs. This prevents non-web URL schemes, but redirects still send clients to administrator-supplied destinations; treat route editors as trusted users.

## License

[MIT](LICENSE)
