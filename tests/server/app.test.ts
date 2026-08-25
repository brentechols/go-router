import { request as httpRequest } from "node:http";

import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/server/app";
import type { RouteRepository } from "../../src/server/repository";
import type {
  CreateRouteInput,
  RouteListQuery,
  RouteRecord,
  RouteSuggestion,
  UpdateRouteInput,
  UpsertRouteInput,
} from "../../src/shared/schemas";
import { normalizeName } from "../../src/shared/names";
import { ServiceError } from "../../src/server/errors";

const now = "2026-08-24T12:00:00.000Z";

class MemoryRepository implements RouteRepository {
  routes: RouteRecord[] = [];
  recordedHits: string[] = [];
  ready = true;
  nextId = 1;

  async list(query: RouteListQuery) {
    const filtered = this.routes.filter(
      (route) =>
        !query.q ||
        [route.name, ...route.aliases, route.description].some((value) => value.includes(query.q!)),
    );
    return {
      items: filtered.slice(0, query.limit),
      page: { limit: query.limit, total: filtered.length, nextCursor: null, previousCursor: null },
    };
  }

  async getById(id: string) {
    return this.routes.find((route) => route.id === id) ?? null;
  }

  async getByName(name: string) {
    const normalized = normalizeName(name);
    return (
      this.routes.find((route) =>
        [route.name, ...route.aliases].some((candidate) => normalizeName(candidate) === normalized),
      ) ?? null
    );
  }

  async create(input: CreateRouteInput) {
    if (await this.getByName(input.name)) throw new ServiceError("NAME_CONFLICT", "conflict", 409);
    const route: RouteRecord = {
      id: String(this.nextId++),
      name: input.name,
      aliases: input.aliases,
      destinationTemplate: input.destinationTemplate,
      description: input.description,
      tags: input.tags,
      hitCount: "0",
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.routes.push(route);
    return route;
  }

  async update(id: string, input: UpdateRouteInput) {
    const route = await this.getById(id);
    if (!route) throw new ServiceError("NOT_FOUND", "Route not found.", 404);
    const oldName = route.name;
    Object.assign(route, input);
    if (input.name && normalizeName(input.name) !== normalizeName(oldName)) {
      route.aliases = [...new Set([...(input.aliases ?? route.aliases), oldName])];
    }
    route.updatedAt = now;
    return route;
  }

  async upsertByName(name: string, input: UpsertRouteInput) {
    const existing = await this.getByName(name);
    if (existing) {
      if (normalizeName(existing.name) !== normalizeName(name)) {
        throw new ServiceError("NAME_CONFLICT", "alias conflict", 409);
      }
      existing.destinationTemplate = input.destinationTemplate;
      if (input.description !== undefined) existing.description = input.description;
      if (input.tags !== undefined) existing.tags = input.tags;
      if (input.aliases !== undefined) existing.aliases = input.aliases;
      return { route: existing, created: false };
    }
    const route = await this.create({
      name,
      aliases: input.aliases ?? [],
      destinationTemplate: input.destinationTemplate,
      description: input.description ?? "",
      tags: input.tags ?? [],
    });
    return { route, created: true };
  }

  async delete(id: string) {
    const index = this.routes.findIndex((route) => route.id === id);
    if (index < 0) return false;
    this.routes.splice(index, 1);
    return true;
  }

  async suggest(query: string): Promise<RouteSuggestion[]> {
    return this.routes
      .filter((route) => route.name.includes(query.slice(0, 2)))
      .map((route) => ({
        id: route.id,
        name: route.name,
        destinationTemplate: route.destinationTemplate,
        description: route.description,
        score: 0.8,
      }));
  }

  async recordHit(id: string) {
    this.recordedHits.push(id);
  }

  async ping() {
    if (!this.ready) throw new Error("offline");
  }

  async close() {}
}

describe("go-router HTTP application", () => {
  let repository: MemoryRepository;

  beforeEach(() => {
    repository = new MemoryRepository();
  });

  async function app() {
    return buildApp({
      repository,
      config: { publicBaseUrl: "http://go.test", logLevel: "silent", trustProxy: false },
      logger: false,
      serveAdmin: false,
    });
  }

  it("creates, reads, patches, lists, and deletes routes through the versioned API", async () => {
    const server = await app();
    const created = await server.inject({
      method: "POST",
      url: "/api/v1/routes",
      payload: {
        name: "Wiki",
        aliases: ["docs"],
        destinationTemplate: "https://wiki.test/{*}",
        description: "Team knowledge",
        tags: ["Docs"],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      id: "1",
      name: "wiki",
      aliases: ["docs"],
      tags: ["docs"],
    });

    const byAlias = await server.inject({ method: "GET", url: "/api/v1/routes/by-name/docs" });
    expect(byAlias.statusCode).toBe(200);
    expect(byAlias.json().name).toBe("wiki");

    const patched = await server.inject({
      method: "PATCH",
      url: "/api/v1/routes/1",
      payload: { name: "handbook" },
    });
    expect(patched.json()).toMatchObject({ name: "handbook", aliases: ["docs", "wiki"] });

    const listed = await server.inject({ method: "GET", url: "/api/v1/routes?limit=10&q=hand" });
    expect(listed.json()).toMatchObject({
      page: { limit: 10, total: 1 },
      items: [{ name: "handbook" }],
    });

    expect((await server.inject({ method: "DELETE", url: "/api/v1/routes/1" })).statusCode).toBe(
      204,
    );
    expect((await server.inject({ method: "GET", url: "/api/v1/routes/1" })).statusCode).toBe(404);
    await server.close();
  });

  it("contracts idempotent by-name upserts, alias conflicts, and suggestions", async () => {
    const server = await app();
    const created = await server.inject({
      method: "PUT",
      url: "/api/v1/routes/by-name/wiki",
      payload: {
        aliases: ["docs"],
        destinationTemplate: "https://wiki.test/{*}",
        description: "Knowledge base",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "wiki", aliases: ["docs"] });

    const updated = await server.inject({
      method: "PUT",
      url: "/api/v1/routes/by-name/wiki",
      payload: {
        destinationTemplate: "https://new-wiki.test/{*}",
        description: "Updated knowledge base",
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: created.json().id,
      destinationTemplate: "https://new-wiki.test/{*}",
    });

    const aliasConflict = await server.inject({
      method: "PUT",
      url: "/api/v1/routes/by-name/docs",
      payload: { destinationTemplate: "https://cannot-steal.test" },
    });
    expect(aliasConflict.statusCode).toBe(409);
    expect(aliasConflict.json()).toMatchObject({ error: { code: "NAME_CONFLICT" } });

    const suggestions = await server.inject({
      method: "GET",
      url: "/api/v1/routes/suggestions?q=wi&limit=3",
    });
    expect(suggestions.statusCode).toBe(200);
    expect(suggestions.json()).toMatchObject({ items: [{ id: created.json().id, name: "wiki" }] });
    await server.close();
  });

  it("resolves path arguments and repeated query arguments with a no-store 302", async () => {
    await repository.create({
      name: "issue",
      aliases: [],
      destinationTemplate: "https://tracker.test/{*}/{*}",
      description: "",
      tags: [],
    });
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/issue/team?args=42&ignored=no" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://tracker.test/team/42");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(repository.recordedHits).toEqual(["1"]);
    await server.close();
  });

  it("decodes each raw path segment once without losing encoded slash boundaries", async () => {
    await repository.create({
      name: "encoded",
      aliases: [],
      destinationTemplate: "https://files.test/{*}/{*}/{*}",
      description: "",
      tags: [],
    });
    const server = await app();
    const response = await server.inject({
      method: "GET",
      url: "/encoded/a%2Fb/c%252Fd/hello%20world",
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://files.test/a%2Fb/c%252Fd/hello%20world");
    await server.close();
  });

  it("preserves percent-encoded dot segments from the literal request target", async () => {
    await repository.create({
      name: "dot-segment",
      aliases: [],
      destinationTemplate: "https://files.test/?value={*}",
      description: "",
      tags: [],
    });
    const server = await app();
    const address = await server.listen({ host: "127.0.0.1", port: 0 });
    const port = new URL(address).port;
    const response = await new Promise<{ statusCode?: number; location?: string }>(
      (resolve, reject) => {
        const outgoing = httpRequest(
          {
            host: "127.0.0.1",
            port,
            method: "GET",
            // node:http sends this request target verbatim; URL/fetch/inject normalize
            // encoded dot segments before Fastify can observe request.raw.url.
            path: "/dot-segment/%2E%2E",
          },
          (incoming) => {
            incoming.resume();
            incoming.once("end", () =>
              resolve({
                statusCode: incoming.statusCode,
                location: incoming.headers.location,
              }),
            );
          },
        );
        outgoing.once("error", reject);
        outgoing.end();
      },
    );
    expect(response.statusCode).toBe(302);
    expect(response.location).toBe("https://files.test/?value=..");
    await server.close();
  });

  it("resolves whole-query input across multiple placeholders", async () => {
    await repository.create({
      name: "search",
      aliases: [],
      destinationTemplate: "https://search.test/{*}?q={*}",
      description: "",
      tags: [],
    });
    const server = await app();
    const response = await server.inject({
      method: "GET",
      url: "/?q=search%20engineering%20design%20docs",
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://search.test/engineering?q=design%20docs");
    await server.close();
  });

  it("returns an actionable HTML miss page preserving arguments", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/missing/abc?args=def" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("/admin/new?");
    expect(response.body).toContain("name=missing");
    expect(response.body).toContain("args=abc");
    expect(response.body).toContain("args=def");
    expect(response.body).toContain("from=suggestion");
    await server.close();
  });

  it("returns 422 HTML for missing or unexpected redirect arguments", async () => {
    await repository.create({
      name: "required",
      aliases: [],
      destinationTemplate: "https://x.test/{*}",
      description: "",
      tags: [],
    });
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/required" });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain("requires argument 1");
    await server.close();
  });

  it("keeps malformed JSON as a structured client error", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/routes",
      headers: { "content-type": "application/json" },
      payload: '{"name":',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "FST_ERR_CTP_INVALID_JSON_BODY" },
    });
    await server.close();
  });

  it("exposes health, database-aware readiness, and OpenAPI documentation", async () => {
    const server = await app();
    expect((await server.inject("/healthz")).statusCode).toBe(200);
    expect((await server.inject("/readyz")).statusCode).toBe(200);
    repository.ready = false;
    expect((await server.inject("/readyz")).statusCode).toBe(503);
    expect((await server.inject("/api/docs/json")).statusCode).toBe(200);
    const reservedMiss = await server.inject("/api/not-a-real-endpoint");
    expect(reservedMiss.statusCode).toBe(404);
    expect(reservedMiss.json()).toEqual({
      error: { code: "NOT_FOUND", message: "System endpoint not found." },
    });
    expect((await server.inject("/healthz/deeper")).headers["content-type"]).toContain(
      "application/json",
    );
    await server.close();
  });
});
