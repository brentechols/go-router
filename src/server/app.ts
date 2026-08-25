import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";

import type { AppConfig } from "./config";
import { ServiceError } from "./errors";
import type { RouteRepository } from "./repository";
import { registerApi } from "./api";
import { registerRedirects } from "./redirects";
import { registerAdminAssets } from "./static";

export type BuildAppOptions = {
  repository: RouteRepository;
  config: Pick<AppConfig, "publicBaseUrl" | "logLevel" | "trustProxy">;
  logger?: boolean;
  serveAdmin?: boolean;
};

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.config.logLevel },
    trustProxy: options.config.trustProxy,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "go-router API",
        description: "Manage and resolve self-hosted go links.",
        version: "1.0.0",
      },
      servers: [{ url: options.config.publicBaseUrl }],
      tags: [{ name: "routes", description: "Go route management" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServiceError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    if (
      error instanceof ZodError ||
      (typeof error === "object" && error !== null && "validation" in error)
    ) {
      const details =
        error instanceof ZodError ? error.issues : (error as { validation?: unknown }).validation;
      return reply
        .code(422)
        .send(errorBody("VALIDATION_ERROR", "Request validation failed.", details));
    }
    if (typeof error === "object" && error !== null) {
      const candidate = error as {
        statusCode?: unknown;
        code?: unknown;
        message?: unknown;
      };
      const clientStatus =
        typeof candidate.statusCode === "number" &&
        candidate.statusCode >= 400 &&
        candidate.statusCode < 500
          ? candidate.statusCode
          : null;
      if (clientStatus !== null) {
        const code = typeof candidate.code === "string" ? candidate.code : "BAD_REQUEST";
        const message =
          typeof candidate.message === "string" ? candidate.message : "The request was rejected.";
        return reply.code(clientStatus).send(errorBody(code, message));
      }
    }
    request.log.error({ error }, "Unhandled request error");
    return reply.code(500).send(errorBody("INTERNAL_ERROR", "An unexpected error occurred."));
  });

  app.get("/healthz", { schema: { hide: true } }, async () => ({ status: "ok" }));
  app.get("/readyz", { schema: { hide: true } }, async (_request, reply) => {
    try {
      await options.repository.ping();
      return { status: "ready" };
    } catch {
      return reply.code(503).send(errorBody("DATABASE_UNAVAILABLE", "Database is not ready."));
    }
  });

  await registerApi(app, options.repository);
  const servesAdmin = options.serveAdmin !== false && (await registerAdminAssets(app));

  const reservedNotFound = async (_request: unknown, reply: import("fastify").FastifyReply) =>
    reply.code(404).send(errorBody("NOT_FOUND", "System endpoint not found."));
  app.all("/api", { schema: { hide: true } }, reservedNotFound);
  app.all("/api/*", { schema: { hide: true } }, reservedNotFound);
  app.all("/healthz/*", { schema: { hide: true } }, reservedNotFound);
  app.all("/readyz/*", { schema: { hide: true } }, reservedNotFound);
  app.all("/assets", { schema: { hide: true } }, reservedNotFound);
  app.all("/assets/*", { schema: { hide: true } }, reservedNotFound);
  app.all("/favicon.ico", { schema: { hide: true } }, reservedNotFound);
  if (!servesAdmin) {
    app.all("/admin", { schema: { hide: true } }, reservedNotFound);
    app.all("/admin/*", { schema: { hide: true } }, reservedNotFound);
  }
  await registerRedirects(app, options.repository);

  app.addHook("onClose", async () => options.repository.close());
  return app;
}
