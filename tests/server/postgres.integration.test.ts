import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client";
import { ServiceError } from "../../src/server/errors";
import { PostgresRouteRepository } from "../../src/server/repository";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("PostgresRouteRepository integration", () => {
  let database: DatabaseClient;
  let repository: PostgresRouteRepository;
  let createdIds: string[] = [];

  const uniqueName = (suffix: string) =>
    `it${randomUUID().replaceAll("-", "").slice(0, 12)}-${suffix}`;

  beforeAll(() => {
    database = createDatabaseClient({
      databaseUrl,
      dbPoolMax: 10,
      dbIdleTimeoutSeconds: 10,
    });
    repository = new PostgresRouteRepository(database);
  });

  afterEach(async () => {
    await Promise.all(createdIds.map((id) => repository.delete(id)));
    createdIds = [];
  });

  afterAll(async () => {
    await repository.close();
  });

  it("creates routes, serializes concurrent upserts, and refuses to steal aliases", async () => {
    const canonical = uniqueName("canonical");
    const alias = uniqueName("alias");
    const created = await repository.create({
      name: canonical,
      aliases: [alias],
      destinationTemplate: "https://example.test/{*}",
      description: "initial",
      tags: ["integration"],
    });
    createdIds.push(created.id);

    await expect(
      repository.upsertByName(alias, {
        destinationTemplate: "https://other.test/{*}",
      }),
    ).rejects.toMatchObject({
      code: "NAME_CONFLICT",
      statusCode: 409,
    } satisfies Partial<ServiceError>);

    const freshName = uniqueName("atomic");
    const results = await Promise.all([
      repository.upsertByName(freshName, {
        destinationTemplate: "https://atomic.test/{*}",
        description: "same write",
      }),
      repository.upsertByName(freshName, {
        destinationTemplate: "https://atomic.test/{*}",
        description: "same write",
      }),
    ]);
    createdIds.push(results[0].route.id);
    expect(new Set(results.map((result) => result.route.id)).size).toBe(1);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
  });

  it("keeps route-before-name lock order during concurrent rename/delete and upsert", async () => {
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const oldName = uniqueName(`lock-old-${iteration}`);
      const renamed = uniqueName(`lock-new-${iteration}`);
      const route = await repository.create({
        name: oldName,
        aliases: [],
        destinationTemplate: "https://before.test",
        description: "",
        tags: [],
      });
      createdIds.push(route.id);

      const [renameResult, upsertResult] = await Promise.allSettled([
        repository.update(route.id, { name: renamed }),
        repository.upsertByName(oldName, {
          destinationTemplate: "https://during.test",
        }),
      ]);
      expect(renameResult.status).toBe("fulfilled");
      if (upsertResult.status === "rejected") {
        expect(upsertResult.reason).toMatchObject({
          code: "NAME_CONFLICT",
          statusCode: 409,
        });
      }
    }

    for (let iteration = 0; iteration < 6; iteration += 1) {
      const name = uniqueName(`delete-lock-${iteration}`);
      const route = await repository.create({
        name,
        aliases: [],
        destinationTemplate: "https://before.test",
        description: "",
        tags: [],
      });
      createdIds.push(route.id);

      const [deleteResult, upsertResult] = await Promise.allSettled([
        repository.delete(route.id),
        repository.upsertByName(name, {
          destinationTemplate: "https://after.test",
        }),
      ]);
      expect(deleteResult).toMatchObject({ status: "fulfilled", value: true });
      expect(upsertResult.status).toBe("fulfilled");
      if (upsertResult.status === "fulfilled" && upsertResult.value.route.id !== route.id) {
        createdIds.push(upsertResult.value.route.id);
      }
    }
  });

  it("keeps the previous canonical name as an alias when renaming", async () => {
    const oldName = uniqueName("old");
    const newName = uniqueName("new");
    const created = await repository.create({
      name: oldName,
      aliases: [],
      destinationTemplate: "https://example.test",
      description: "",
      tags: [],
    });
    createdIds.push(created.id);

    const renamed = await repository.update(created.id, { name: newName });
    expect(renamed.name).toBe(newName);
    expect(renamed.aliases).toContain(oldName);
    await expect(repository.getByName(oldName)).resolves.toMatchObject({
      id: created.id,
      name: newName,
    });
  });

  it("lowercases discovery queries and fuzzy-matches aliases", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 6);
    const alias = `engineering-handbook-${token}`;
    const created = await repository.create({
      name: uniqueName("canonical-only"),
      aliases: [alias],
      destinationTemplate: "https://example.test",
      description: "",
      tags: [],
    });
    createdIds.push(created.id);

    const result = await repository.list({
      limit: 10,
      q: `ENGINERING-HANDBOOK-${token}`,
      sort: "name",
      order: "asc",
    });
    expect(result.items.map((route) => route.id)).toContain(created.id);
  });

  it("fuzzy-matches indexed descriptions and destination templates", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 6);
    const created = await repository.create({
      name: uniqueName("search-fields"),
      aliases: [],
      destinationTemplate: `https://search.example.test/engineering-knowledge-${token}`,
      description: `quarterly planning handbook ${token}`,
      tags: [],
    });
    createdIds.push(created.id);

    const byDescription = await repository.list({
      limit: 10,
      q: `QUATERLY PLANNING HANDBOOK ${token}`,
      sort: "name",
      order: "asc",
    });
    expect(byDescription.items.map((route) => route.id)).toContain(created.id);

    const byDestination = await repository.list({
      limit: 10,
      q: `https://search.example.test/enginering-knowledge-${token}`,
      sort: "name",
      order: "asc",
    });
    expect(byDestination.items.map((route) => route.id)).toContain(created.id);
  });

  it("returns fuzzy canonical-name suggestions from pg_trgm", async () => {
    const token = randomUUID().replaceAll("-", "").slice(0, 6);
    const canonical = `engineering-handbook-${token}`;
    const created = await repository.create({
      name: canonical,
      aliases: [],
      destinationTemplate: "https://example.test",
      description: "Engineering docs",
      tags: [],
    });
    createdIds.push(created.id);

    const suggestions = await repository.suggest(`ENGINERING-HANDBOOK-${token}`, 5);
    expect(suggestions.map((suggestion) => suggestion.id)).toContain(created.id);
  });

  it("hard deletes the route and cascades all name rows", async () => {
    const created = await repository.create({
      name: uniqueName("delete"),
      aliases: [uniqueName("delete-alias")],
      destinationTemplate: "https://example.test",
      description: "",
      tags: [],
    });
    expect(await repository.delete(created.id)).toBe(true);
    const names = await database<Array<{ count: string | number }>>`
      SELECT count(*) AS count FROM go_router.route_names WHERE route_id = ${created.id}::bigint
    `;
    expect(Number(names[0].count)).toBe(0);
  });

  it("uses stable keyset cursors when earlier rows are inserted between pages", async () => {
    const prefix = uniqueName("page");
    for (const suffix of ["b", "c", "d", "e"]) {
      const route = await repository.create({
        name: `${prefix}-${suffix}`,
        aliases: [],
        destinationTemplate: "https://example.test",
        description: prefix,
        tags: [],
      });
      createdIds.push(route.id);
    }

    const first = await repository.list({
      limit: 2,
      q: prefix,
      sort: "name",
      order: "asc",
    });
    expect(first.items.map((route) => route.name)).toEqual([`${prefix}-b`, `${prefix}-c`]);
    expect(first.page.nextCursor).toBeTruthy();

    const inserted = await repository.create({
      name: `${prefix}-a`,
      aliases: [],
      destinationTemplate: "https://example.test",
      description: prefix,
      tags: [],
    });
    createdIds.push(inserted.id);

    const second = await repository.list({
      limit: 2,
      cursor: first.page.nextCursor!,
      q: prefix,
      sort: "name",
      order: "asc",
    });
    expect(second.items.map((route) => route.name)).toEqual([`${prefix}-d`, `${prefix}-e`]);

    const previous = await repository.list({
      limit: 2,
      cursor: second.page.previousCursor!,
      q: prefix,
      sort: "name",
      order: "asc",
    });
    expect(previous.items.map((route) => route.name)).toEqual([`${prefix}-b`, `${prefix}-c`]);
  });

  it("preserves PostgreSQL microseconds in timestamp cursor boundaries", async () => {
    const prefix = uniqueName("timestamp-page");
    const created: Array<{ id: string }> = [];
    for (const suffix of ["a", "b", "c"]) {
      const route = await repository.create({
        name: `${prefix}-${suffix}`,
        aliases: [],
        destinationTemplate: "https://example.test",
        description: prefix,
        tags: [],
      });
      created.push(route);
      createdIds.push(route.id);
    }

    for (const [index, route] of created.entries()) {
      const microseconds = String(123_456 + index).padStart(6, "0");
      const timestamp = `2026-08-24T12:00:00.${microseconds}Z`;
      await database`
        UPDATE go_router.routes
        SET created_at = ${timestamp}::timestamptz,
            updated_at = ${timestamp}::timestamptz,
            last_used_at = ${timestamp}::timestamptz
        WHERE id = ${route.id}::bigint
      `;
    }

    for (const sort of ["createdAt", "updatedAt", "lastUsedAt"] as const) {
      const visited: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await repository.list({
          limit: 1,
          cursor,
          q: prefix,
          sort,
          order: "asc",
        });
        visited.push(...page.items.map((route) => route.id));
        cursor = page.page.nextCursor ?? undefined;
      } while (cursor);
      expect(visited).toEqual(created.map((route) => route.id));
    }
  });

  it("increments usage atomically under concurrent redirects", async () => {
    const created = await repository.create({
      name: uniqueName("hits"),
      aliases: [],
      destinationTemplate: "https://example.test",
      description: "",
      tags: [],
    });
    createdIds.push(created.id);

    await Promise.all(Array.from({ length: 50 }, () => repository.recordHit(created.id)));
    await expect(repository.getById(created.id)).resolves.toMatchObject({
      hitCount: "50",
    });
  });
});
