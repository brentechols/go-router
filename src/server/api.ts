import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  apiErrorSchema,
  createRouteSchema,
  patchRouteSchema,
  routeListQuerySchema,
  routeListResponseSchema,
  routeSchema,
  suggestionsResponseSchema,
  upsertRouteSchema,
} from "../shared/schemas";
import { validateName } from "../shared/names";
import { ServiceError } from "./errors";
import type { RouteRepository } from "./repository";

const idParametersSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine(
      (id) => id.length <= 19 && /^[1-9]\d*$/.test(id) && BigInt(id) <= 9_223_372_036_854_775_807n,
      "Route id is out of range.",
    ),
});
const nameParametersSchema = z.object({ name: z.string() });

const documentedErrors = {
  400: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
};

export async function registerApi(
  app: FastifyInstance,
  repository: RouteRepository,
): Promise<void> {
  app.get(
    "/api/v1/routes",
    {
      schema: {
        tags: ["routes"],
        summary: "List routes",
        querystring: routeListQuerySchema,
        response: { 200: routeListResponseSchema, ...documentedErrors },
      },
    },
    async (request) => repository.list(routeListQuerySchema.parse(request.query)),
  );

  app.post(
    "/api/v1/routes",
    {
      schema: {
        tags: ["routes"],
        summary: "Create a route",
        body: createRouteSchema,
        response: { 201: routeSchema, ...documentedErrors },
      },
    },
    async (request, reply) => {
      const route = await repository.create(createRouteSchema.parse(request.body));
      return reply.code(201).send(route);
    },
  );

  app.get(
    "/api/v1/routes/suggestions",
    {
      schema: {
        tags: ["routes"],
        summary: "Suggest similar routes",
        querystring: z.object({
          q: z.string().trim().min(1).max(256),
          limit: z.coerce.number().int().min(1).max(20).default(5),
        }),
        response: { 200: suggestionsResponseSchema, ...documentedErrors },
      },
    },
    async (request) => {
      const query = z
        .object({
          q: z.string().trim().min(1).max(256),
          limit: z.coerce.number().int().min(1).max(20).default(5),
        })
        .parse(request.query);
      return { items: await repository.suggest(query.q, query.limit) };
    },
  );

  app.get(
    "/api/v1/routes/by-name/:name",
    {
      schema: {
        tags: ["routes"],
        summary: "Get a route by canonical name or alias",
        params: nameParametersSchema,
        response: { 200: routeSchema, ...documentedErrors },
      },
    },
    async (request) => {
      const { name } = nameParametersSchema.parse(request.params);
      const route = await repository.getByName(name);
      if (!route) throw new ServiceError("NOT_FOUND", "Route not found.", 404);
      return route;
    },
  );

  app.put(
    "/api/v1/routes/by-name/:name",
    {
      schema: {
        tags: ["routes"],
        summary: "Create or update a canonical route",
        params: nameParametersSchema,
        body: upsertRouteSchema,
        response: { 200: routeSchema, 201: routeSchema, ...documentedErrors },
      },
    },
    async (request, reply) => {
      const { name: rawName } = nameParametersSchema.parse(request.params);
      const name = validateName(rawName);
      if (!name.valid) {
        throw new ServiceError("VALIDATION_ERROR", name.message, 422);
      }
      const result = await repository.upsertByName(
        name.name,
        upsertRouteSchema.parse(request.body),
      );
      return reply.code(result.created ? 201 : 200).send(result.route);
    },
  );

  app.get(
    "/api/v1/routes/:id",
    {
      schema: {
        tags: ["routes"],
        summary: "Get a route",
        params: idParametersSchema,
        response: { 200: routeSchema, ...documentedErrors },
      },
    },
    async (request) => {
      const { id } = idParametersSchema.parse(request.params);
      const route = await repository.getById(id);
      if (!route) throw new ServiceError("NOT_FOUND", "Route not found.", 404);
      return route;
    },
  );

  app.patch(
    "/api/v1/routes/:id",
    {
      schema: {
        tags: ["routes"],
        summary: "Update a route",
        params: idParametersSchema,
        body: patchRouteSchema,
        response: { 200: routeSchema, ...documentedErrors },
      },
    },
    async (request) => {
      const { id } = idParametersSchema.parse(request.params);
      return repository.update(id, patchRouteSchema.parse(request.body));
    },
  );

  app.delete(
    "/api/v1/routes/:id",
    {
      schema: {
        tags: ["routes"],
        summary: "Delete a route permanently",
        params: idParametersSchema,
        response: { 204: z.null().describe("Route deleted"), ...documentedErrors },
      },
    },
    async (request, reply) => {
      const { id } = idParametersSchema.parse(request.params);
      if (!(await repository.delete(id))) {
        throw new ServiceError("NOT_FOUND", "Route not found.", 404);
      }
      return reply.code(204).send();
    },
  );
}
