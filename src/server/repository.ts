import type { Sql, TransactionSql } from "postgres";

import { normalizeName } from "../shared/names";
import type {
  CreateRouteInput,
  RouteListQuery,
  RouteListResponse,
  RouteRecord,
  RouteSuggestion,
  UpdateRouteInput,
  UpsertRouteInput,
} from "../shared/schemas";
import { ServiceError, isPostgresUniqueViolation } from "./errors";
import type { DatabaseClient } from "./db/client";

type Queryable = Sql<Record<string, unknown>> | TransactionSql<Record<string, unknown>>;

type DatabaseRoute = {
  id: string | bigint | number;
  name: string;
  aliases: string[] | null;
  destination_template: string;
  description: string;
  tags: string[];
  hit_count: string | bigint | number;
  last_used_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  sort_value?: string | bigint | number | Date | null;
};

type CursorDirection = "next" | "previous";
type CursorPayload = {
  version: 1;
  sort: RouteListQuery["sort"];
  order: RouteListQuery["order"];
  filter: string;
  value: string | null;
  id: string;
  direction: CursorDirection;
};

export interface RouteRepository {
  list(query: RouteListQuery): Promise<RouteListResponse>;
  getById(id: string): Promise<RouteRecord | null>;
  getByName(name: string): Promise<RouteRecord | null>;
  create(input: CreateRouteInput): Promise<RouteRecord>;
  update(id: string, input: UpdateRouteInput): Promise<RouteRecord>;
  upsertByName(
    name: string,
    input: UpsertRouteInput,
  ): Promise<{ route: RouteRecord; created: boolean }>;
  delete(id: string): Promise<boolean>;
  suggest(query: string, limit?: number): Promise<RouteSuggestion[]>;
  recordHit(id: string): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRoute(row: DatabaseRoute): RouteRecord {
  return {
    id: String(row.id),
    name: row.name,
    aliases: row.aliases ?? [],
    destinationTemplate: row.destination_template,
    description: row.description,
    tags: row.tags,
    hitCount: String(row.hit_count),
    lastUsedAt: row.last_used_at === null ? null : toIsoString(row.last_used_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string, query: RouteListQuery): CursorPayload {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;
    if (
      decoded.version !== 1 ||
      decoded.sort !== query.sort ||
      decoded.order !== query.order ||
      decoded.filter !== listFilterFingerprint(query) ||
      (decoded.direction !== "next" && decoded.direction !== "previous") ||
      typeof decoded.id !== "string" ||
      !isPositiveBigint(decoded.id) ||
      (typeof decoded.value !== "string" && decoded.value !== null)
    ) {
      throw new Error("cursor shape mismatch");
    }
    const validValue =
      (query.sort === "name" && typeof decoded.value === "string" && decoded.value.length > 0) ||
      (query.sort === "hitCount" &&
        typeof decoded.value === "string" &&
        isUnsignedBigint(decoded.value)) ||
      ((query.sort === "createdAt" || query.sort === "updatedAt") &&
        typeof decoded.value === "string" &&
        isExactCursorTimestamp(decoded.value)) ||
      (query.sort === "lastUsedAt" &&
        (decoded.value === null ||
          (typeof decoded.value === "string" && isExactCursorTimestamp(decoded.value))));
    if (!validValue) throw new Error("cursor value does not match sort type");
    return decoded as CursorPayload;
  } catch {
    throw new ServiceError(
      "INVALID_CURSOR",
      "The cursor is invalid or does not match the requested sort order.",
      400,
    );
  }
}

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function isPositiveBigint(value: string): boolean {
  return value.length <= 19 && /^[1-9]\d*$/.test(value) && BigInt(value) <= MAX_POSTGRES_BIGINT;
}

function isUnsignedBigint(value: string): boolean {
  return value.length <= 19 && /^\d+$/.test(value) && BigInt(value) <= MAX_POSTGRES_BIGINT;
}

function isExactCursorTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) return false;
  const millisecondValue = `${value.slice(0, 23)}Z`;
  return new Date(millisecondValue).toISOString() === millisecondValue;
}

function listFilterFingerprint(query: RouteListQuery): string {
  const tags = query.tags
    ? (Array.isArray(query.tags) ? query.tags : query.tags.split(","))
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .sort()
    : [];
  return JSON.stringify({ q: query.q?.trim().toLowerCase() ?? "", tags });
}

function cursorValue(row: DatabaseRoute, sort: RouteListQuery["sort"]): string | null {
  if (Object.hasOwn(row, "sort_value")) {
    return row.sort_value === null || row.sort_value === undefined ? null : String(row.sort_value);
  }
  if (sort === "name") return row.name;
  if (sort === "hitCount") return String(row.hit_count);
  const value =
    sort === "createdAt"
      ? row.created_at
      : sort === "updatedAt"
        ? row.updated_at
        : row.last_used_at;
  return value === null ? null : toIsoString(value);
}

function cursorFor(row: DatabaseRoute, query: RouteListQuery, direction: CursorDirection): string {
  return encodeCursor({
    version: 1,
    sort: query.sort,
    order: query.order,
    filter: listFilterFingerprint(query),
    value: cursorValue(row, query.sort),
    id: String(row.id),
    direction,
  });
}

function routeSelect(query: Queryable, exactSort?: RouteListQuery["sort"]) {
  const exactSortValue =
    exactSort === "name"
      ? query`primary_name.name::text`
      : exactSort === "hitCount"
        ? query`r.hit_count::text`
        : exactSort === "createdAt"
          ? query`to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
          : exactSort === "updatedAt"
            ? query`to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
            : exactSort === "lastUsedAt"
              ? query`CASE
                  WHEN r.last_used_at IS NULL THEN NULL
                  ELSE to_char(r.last_used_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                END`
              : null;
  return query`
    SELECT
      r.id,
      primary_name.name,
      ARRAY(
        SELECT alias.name
        FROM go_router.route_names alias
        WHERE alias.route_id = r.id AND alias.is_primary = false
        ORDER BY alias.name
      ) AS aliases,
      r.destination_template,
      r.description,
      r.tags,
      r.hit_count,
      r.last_used_at,
      r.created_at,
      r.updated_at
      ${exactSortValue === null ? query`` : query`, ${exactSortValue} AS sort_value`}
    FROM go_router.routes r
    JOIN go_router.route_names primary_name
      ON primary_name.route_id = r.id AND primary_name.is_primary = true
  `;
}

async function getByIdWith(
  query: Queryable,
  id: string,
  lock = false,
): Promise<RouteRecord | null> {
  const rows = await query<DatabaseRoute[]>`
    ${routeSelect(query)}
    WHERE r.id = ${id}::bigint
    ${lock ? query`FOR UPDATE OF r` : query``}
  `;
  return rows[0] ? mapRoute(rows[0]) : null;
}

async function insertNames(
  query: Queryable,
  routeId: string,
  canonicalName: string,
  aliases: readonly string[],
): Promise<void> {
  const allNames = [canonicalName, ...aliases];
  const seen = new Set<string>();
  for (const [index, rawName] of allNames.entries()) {
    const name = rawName.trim().toLowerCase();
    const normalized = normalizeName(name);
    if (seen.has(normalized)) {
      throw new ServiceError(
        "NAME_CONFLICT",
        `The name "${name}" conflicts with another name on this route.`,
        409,
      );
    }
    seen.add(normalized);
    await query`
      INSERT INTO go_router.route_names (route_id, name, normalized_name, is_primary)
      VALUES (${routeId}::bigint, ${name}, ${normalized}, ${index === 0})
    `;
  }
}

function conflictError(): ServiceError {
  return new ServiceError(
    "NAME_CONFLICT",
    "That name or an equivalent hyphen/underscore variant is already registered.",
    409,
  );
}

class UpsertLookupChangedError extends Error {}

export class PostgresRouteRepository implements RouteRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(input: RouteListQuery): Promise<RouteListResponse> {
    const query = this.database;
    const tags = input.tags
      ? (Array.isArray(input.tags) ? input.tags : input.tags.split(","))
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const search = input.q?.trim().toLowerCase() || null;
    const cursor = input.cursor ? decodeCursor(input.cursor, input) : null;
    const reverse = cursor?.direction === "previous";
    const effectiveAscending = (input.order === "asc") !== reverse;

    const sortExpression =
      input.sort === "name"
        ? query`primary_name.name`
        : input.sort === "createdAt"
          ? query`r.created_at`
          : input.sort === "updatedAt"
            ? query`r.updated_at`
            : input.sort === "hitCount"
              ? query`r.hit_count`
              : query`COALESCE(r.last_used_at, '-infinity'::timestamptz)`;
    let cursorCondition = query``;
    if (cursor) {
      const comparison = effectiveAscending ? query`>` : query`<`;
      const cursorSortValue =
        input.sort === "hitCount"
          ? query`${cursor.value ?? "0"}::bigint`
          : input.sort === "createdAt" || input.sort === "updatedAt"
            ? query`${cursor.value}::timestamptz`
            : input.sort === "lastUsedAt"
              ? query`COALESCE(${cursor.value}::timestamptz, '-infinity'::timestamptz)`
              : query`${cursor.value}`;
      cursorCondition = query`
        AND (${sortExpression}, r.id) ${comparison} (${cursorSortValue}, ${cursor.id}::bigint)
      `;
    }

    const filters = query`
      WHERE (${search}::text IS NULL OR
        primary_name.name ILIKE '%' || ${search}::text || '%' OR
        primary_name.name % ${search}::text OR
        EXISTS (
          SELECT 1 FROM go_router.route_names searchable_name
          WHERE searchable_name.route_id = r.id
            AND (
              searchable_name.name ILIKE '%' || ${search}::text || '%' OR
              searchable_name.name % ${search}::text
            )
        ) OR
        r.description ILIKE '%' || ${search}::text || '%' OR
        r.description % ${search}::text OR
        r.destination_template ILIKE '%' || ${search}::text || '%' OR
        r.destination_template % ${search}::text)
      AND (${tags}::text[] = ARRAY[]::text[] OR r.tags @> ${tags}::text[])
    `;

    const totalRows = await query<Array<{ total: string | number }>>`
      SELECT count(*) AS total
      FROM go_router.routes r
      JOIN go_router.route_names primary_name
        ON primary_name.route_id = r.id AND primary_name.is_primary = true
      ${filters}
    `;

    const rows = await query<DatabaseRoute[]>`
      ${routeSelect(query, input.sort)}
      ${filters}
      ${cursorCondition}
      ORDER BY ${sortExpression} ${effectiveAscending ? query`ASC` : query`DESC`},
        r.id ${effectiveAscending ? query`ASC` : query`DESC`}
      LIMIT ${input.limit + 1}
    `;

    const hasMore = rows.length > input.limit;
    if (hasMore) rows.pop();
    if (reverse) rows.reverse();

    const first = rows[0];
    const last = rows.at(-1);
    let nextCursor: string | null = null;
    let previousCursor: string | null = null;

    if (!reverse) {
      nextCursor = hasMore && last ? cursorFor(last, input, "next") : null;
      previousCursor = cursor && first ? cursorFor(first, input, "previous") : null;
    } else {
      previousCursor = hasMore && first ? cursorFor(first, input, "previous") : null;
      nextCursor = cursor && last ? cursorFor(last, input, "next") : null;
    }

    return {
      items: rows.map(mapRoute),
      page: {
        limit: input.limit,
        total: Number(totalRows[0]?.total ?? 0),
        nextCursor,
        previousCursor,
      },
    };
  }

  async getById(id: string): Promise<RouteRecord | null> {
    return getByIdWith(this.database, id);
  }

  async getByName(name: string): Promise<RouteRecord | null> {
    const normalized = normalizeName(name);
    const rows = await this.database<DatabaseRoute[]>`
      ${routeSelect(this.database)}
      JOIN go_router.route_names lookup ON lookup.route_id = r.id
      WHERE lookup.normalized_name = ${normalized}
      LIMIT 1
    `;
    return rows[0] ? mapRoute(rows[0]) : null;
  }

  async create(input: CreateRouteInput): Promise<RouteRecord> {
    try {
      return await this.database.begin(async (transaction) => {
        const inserted = await transaction<Array<{ id: string | bigint }>>`
          INSERT INTO go_router.routes (destination_template, description, tags)
          VALUES (${input.destinationTemplate}, ${input.description}, ${input.tags})
          RETURNING id
        `;
        const id = String(inserted[0].id);
        await insertNames(transaction, id, input.name, input.aliases);
        const route = await getByIdWith(transaction, id);
        if (!route) throw new Error("Route disappeared during creation.");
        return route;
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isPostgresUniqueViolation(error)) throw conflictError();
      throw error;
    }
  }

  async update(id: string, input: UpdateRouteInput): Promise<RouteRecord> {
    try {
      return await this.database.begin(async (transaction) => {
        const current = await getByIdWith(transaction, id, true);
        if (!current) {
          throw new ServiceError("NOT_FOUND", "Route not found.", 404);
        }

        await transaction`
          UPDATE go_router.routes
          SET
            destination_template = COALESCE(${input.destinationTemplate ?? null}, destination_template),
            description = COALESCE(${input.description ?? null}, description),
            tags = COALESCE(${input.tags ?? null}::text[], tags),
            updated_at = now()
          WHERE id = ${id}::bigint
        `;

        if (input.name !== undefined || input.aliases !== undefined) {
          const canonical = input.name ?? current.name;
          const aliases = input.aliases ? [...input.aliases] : [...current.aliases];
          if (
            input.name !== undefined &&
            normalizeName(input.name) !== normalizeName(current.name)
          ) {
            aliases.push(current.name);
          }
          const canonicalNormalized = normalizeName(canonical);
          const uniqueAliases = [
            ...new Map(
              aliases
                .filter((alias) => normalizeName(alias) !== canonicalNormalized)
                .map((alias) => [normalizeName(alias), alias.toLowerCase()]),
            ).values(),
          ];
          await transaction`DELETE FROM go_router.route_names WHERE route_id = ${id}::bigint`;
          await insertNames(transaction, id, canonical, uniqueAliases);
        }

        const route = await getByIdWith(transaction, id);
        if (!route) throw new Error("Route disappeared during update.");
        return route;
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (isPostgresUniqueViolation(error)) throw conflictError();
      throw error;
    }
  }

  async upsertByName(
    name: string,
    input: UpsertRouteInput,
  ): Promise<{ route: RouteRecord; created: boolean }> {
    const canonicalName = name.trim().toLowerCase();
    const normalized = normalizeName(canonicalName);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.begin(async (transaction) => {
          await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${normalized}, 0))`;
          // This first lookup is deliberately unlocked. Existing routes are always
          // locked before their name rows, matching update/delete lock ordering.
          const matches = await transaction<
            Array<{ route_id: string | bigint; is_primary: boolean }>
          >`
            SELECT route_id, is_primary
            FROM go_router.route_names
            WHERE normalized_name = ${normalized}
          `;

          const match = matches[0];
          if (!match) {
            const inserted = await transaction<Array<{ id: string | bigint }>>`
              INSERT INTO go_router.routes (destination_template, description, tags)
              VALUES (${input.destinationTemplate}, ${input.description ?? ""}, ${input.tags ?? []})
              RETURNING id
            `;
            const id = String(inserted[0].id);
            await insertNames(transaction, id, canonicalName, input.aliases ?? []);
            const route = await getByIdWith(transaction, id);
            if (!route) throw new Error("Route disappeared during upsert.");
            return { route, created: true };
          }

          const id = String(match.route_id);
          const current = await getByIdWith(transaction, id, true);
          if (!current) throw new UpsertLookupChangedError();

          // A rename or delete may have changed the unlocked lookup while the route
          // lock was pending. Lock and revalidate the name without ever taking a
          // second route lock in this transaction; retry from scratch on mismatch.
          const lockedMatches = await transaction<
            Array<{ route_id: string | bigint; is_primary: boolean }>
          >`
            SELECT route_id, is_primary
            FROM go_router.route_names
            WHERE normalized_name = ${normalized}
            FOR UPDATE
          `;
          const lockedMatch = lockedMatches[0];
          if (
            !lockedMatch ||
            String(lockedMatch.route_id) !== id ||
            lockedMatch.is_primary !== match.is_primary
          ) {
            throw new UpsertLookupChangedError();
          }
          if (!lockedMatch.is_primary) {
            throw new ServiceError(
              "NAME_CONFLICT",
              "The requested name is an alias of another route and cannot be upserted.",
              409,
            );
          }

          await transaction`
            UPDATE go_router.routes
            SET destination_template = ${input.destinationTemplate},
                description = ${input.description ?? current.description},
                tags = ${input.tags ?? current.tags},
                updated_at = now()
            WHERE id = ${id}::bigint
          `;
          if (input.aliases) {
            await transaction`DELETE FROM go_router.route_names WHERE route_id = ${id}::bigint`;
            await insertNames(transaction, id, current.name, input.aliases);
          }
          const route = await getByIdWith(transaction, id);
          if (!route) throw new Error("Route disappeared during upsert.");
          return { route, created: false };
        });
      } catch (error) {
        if (error instanceof UpsertLookupChangedError) {
          if (attempt < 2) continue;
          throw new ServiceError(
            "NAME_CONFLICT",
            "The route name changed concurrently; retry the request.",
            409,
          );
        }
        if (error instanceof ServiceError) throw error;
        if (isPostgresUniqueViolation(error)) throw conflictError();
        throw error;
      }
    }
    throw new Error("Unreachable upsert retry state.");
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.database<Array<{ id: string | bigint }>>`
      DELETE FROM go_router.routes WHERE id = ${id}::bigint RETURNING id
    `;
    return rows.length > 0;
  }

  async suggest(search: string, limit = 5): Promise<RouteSuggestion[]> {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const rows = await this.database<
      Array<{
        id: string | bigint;
        name: string;
        destination_template: string;
        description: string;
        score: string | number;
      }>
    >`
      SELECT r.id, primary_name.name, r.destination_template, r.description,
        GREATEST(
          similarity(primary_name.name, ${query}),
          CASE WHEN primary_name.name ILIKE '%' || ${query} || '%' THEN 0.75 ELSE 0 END
        ) AS score
      FROM go_router.routes r
      JOIN go_router.route_names primary_name
        ON primary_name.route_id = r.id AND primary_name.is_primary = true
      WHERE primary_name.name % ${query} OR primary_name.name ILIKE '%' || ${query} || '%'
      ORDER BY score DESC, primary_name.name ASC
      LIMIT ${Math.min(Math.max(limit, 1), 20)}
    `;
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      destinationTemplate: row.destination_template,
      description: row.description,
      score: Number(row.score),
    }));
  }

  async recordHit(id: string): Promise<void> {
    await this.database`
      UPDATE go_router.routes
      SET hit_count = hit_count + 1, last_used_at = now()
      WHERE id = ${id}::bigint
    `;
  }

  async ping(): Promise<void> {
    await this.database`SELECT 1`;
  }

  async close(): Promise<void> {
    await this.database.end({ timeout: 5 });
  }
}
