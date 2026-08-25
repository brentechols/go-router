# HTTP API

The management API is rooted at `/api/v1`. JSON errors use this shape:

```json
{
  "error": {
    "code": "NAME_CONFLICT",
    "message": "A route or alias already uses that normalized name.",
    "details": {}
  }
}
```

Interactive OpenAPI documentation is generated from the same Zod schemas used by the server and is available at `/api/docs`.

## Route representation

IDs and counters are strings because PostgreSQL `bigint` values can exceed JavaScript's safe integer range.

```json
{
  "id": "42",
  "name": "gh",
  "aliases": ["github"],
  "destinationTemplate": "https://github.com/{*}",
  "description": "Open a GitHub repository",
  "tags": ["engineering"],
  "hitCount": "18",
  "lastUsedAt": "2026-08-24T20:15:00.000Z",
  "createdAt": "2026-08-20T18:00:00.000Z",
  "updatedAt": "2026-08-24T19:45:00.000Z"
}
```

Names are lowercased and must match `[a-z0-9][a-z0-9_-]{0,63}`. Hyphens and underscores are removed for collision checks. `admin`, `api`, `assets`, `favicon`, `healthz`, and `readyz` are reserved after normalization.

## Endpoints

### List routes

`GET /api/v1/routes`

| Parameter | Behavior                                                          |
| --------- | ----------------------------------------------------------------- |
| `limit`   | Page size, default 50 and maximum 100.                            |
| `cursor`  | Opaque cursor returned by an adjacent page. Do not parse it.      |
| `q`       | Fuzzy search over names, aliases, descriptions, and destinations. |
| `tags`    | Repeat the key to filter on tags: `tags=docs&tags=team`.          |
| `sort`    | `name`, `createdAt`, `updatedAt`, `hitCount`, or `lastUsedAt`.    |
| `order`   | `asc` or `desc`.                                                  |

```json
{
  "items": [],
  "page": {
    "limit": 50,
    "total": 0,
    "nextCursor": null,
    "previousCursor": null
  }
}
```

### Create a route

`POST /api/v1/routes` returns `201 Created`.

```json
{
  "name": "search",
  "aliases": ["s"],
  "destinationTemplate": "https://www.google.com/search?q={*}",
  "description": "Web search",
  "tags": ["common"]
}
```

A canonical name or alias collision returns `409`. Invalid names or templates return `422`.

### Read, update, or delete by ID

- `GET /api/v1/routes/:id`
- `PATCH /api/v1/routes/:id`
- `DELETE /api/v1/routes/:id`

PATCH accepts any non-empty subset of `name`, `aliases`, `destinationTemplate`, `description`, and `tags`. Renaming keeps the prior canonical name as an alias unless that would violate uniqueness. DELETE is permanent and returns no route body.

### Read by name or alias

`GET /api/v1/routes/by-name/:name`

Lookup uses normalized collision semantics and returns the canonical route representation.

### Idempotent upsert by canonical name

`PUT /api/v1/routes/by-name/:name`

```json
{
  "destinationTemplate": "https://github.com/{*}",
  "aliases": ["github"],
  "description": "Open a GitHub repository",
  "tags": ["engineering"]
}
```

The operation creates or replaces the canonical route atomically. It returns `409` if `:name` currently belongs to another route as an alias; upsert never steals an alias.

### Suggestions

`GET /api/v1/routes/suggestions?q=githb`

Returns close canonical matches with their destination, description, and numeric similarity score.

## Redirect entrypoints

- `GET /:name/*` supplies remaining path segments as arguments.
- Repeated `?args=value` parameters supply query arguments.
- `GET /?q=name%20argument%20text` supports browser custom search engines.

Path arguments come first. Other query parameters are ignored rather than copied to the destination. A successful resolution returns `302` and `Cache-Control: no-store`. Unknown routes return an HTML `404` suggestion/create page; invalid or missing arguments return an HTML `422` page. API endpoints always return JSON errors.

See [templates.md](templates.md) for interpolation rules.

## Health endpoints

- `GET /healthz` reports process liveness without requiring PostgreSQL.
- `GET /readyz` succeeds only when the instance is ready to accept application traffic, including database connectivity.
