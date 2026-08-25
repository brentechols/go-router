import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { renderArgumentErrorPage, renderNotFoundPage } from "./html";
import type { RouteRepository } from "./repository";
import {
  renderDestinationTemplate,
  TemplateError,
  type TemplateArgument,
} from "../shared/template";
import { ServiceError } from "./errors";

type RedirectRequest = {
  name: string;
  args: TemplateArgument[];
};

function repeatedArguments(request: FastifyRequest): TemplateArgument[] {
  const url = new URL(request.raw.url ?? "/", "http://go-router.invalid");
  return url.searchParams.getAll("args").map((value) => ({ value, source: "query" }));
}

function pathRequest(request: FastifyRequest, includeWildcard: boolean): RedirectRequest {
  const parameters = request.params as { name: string; "*"?: string };
  const requestTarget = request.raw.url ?? "/";
  const queryStart = requestTarget.indexOf("?");
  // Work from the literal origin-form request target. WHATWG URL parsing removes
  // percent-encoded dot segments before application code can observe them.
  const pathname = queryStart < 0 ? requestTarget : requestTarget.slice(0, queryStart);
  const pathArguments = includeWildcard
    ? pathname
        .split("/")
        .slice(2)
        .filter(Boolean)
        .map((encodedValue) => ({
          // Split the encoded pathname first. Decoding Fastify's wildcard value
          // first would turn %2F into a separator and lose argument boundaries.
          value: decodePathSegment(encodedValue),
          source: "path" as const,
        }))
    : [];
  return { name: parameters.name, args: [...pathArguments, ...repeatedArguments(request)] };
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Path argument contains malformed percent encoding.",
      400,
    );
  }
}

function browserRequest(request: FastifyRequest): RedirectRequest | null {
  const url = new URL(request.raw.url ?? "/", "http://go-router.invalid");
  const input = url.searchParams.get("q")?.trim();
  if (!input) return null;
  const tokens = input.match(/[^\s"']+|"[^"]*"|'[^']*'/g)?.map((token) => {
    const quoted =
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"));
    return quoted ? token.slice(1, -1) : token;
  });
  if (!tokens?.length) return null;
  const [name, ...args] = tokens;
  return {
    name,
    args: args.map((value) => ({ value, source: "query" })),
  };
}

async function resolve(
  repository: RouteRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  resolution: RedirectRequest,
) {
  const route = await repository.getByName(resolution.name);
  if (!route) {
    const suggestions = await repository.suggest(resolution.name);
    return reply
      .code(404)
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(
        renderNotFoundPage({
          name: resolution.name,
          args: resolution.args,
          returnTo: request.raw.url ?? `/${resolution.name}`,
          suggestions,
        }),
      );
  }

  let destination: string;
  try {
    destination = renderDestinationTemplate(route.destinationTemplate, resolution.args);
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    return reply
      .code(422)
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(renderArgumentErrorPage(resolution.name, error.message));
  }

  void repository.recordHit(route.id).catch((error: unknown) => {
    request.log.error({ error, routeId: route.id }, "Unable to record route usage");
  });
  return reply.code(302).header("Cache-Control", "no-store").redirect(destination);
}

export async function registerRedirects(
  app: FastifyInstance,
  repository: RouteRepository,
): Promise<void> {
  app.get("/", async (request, reply) => {
    const resolution = browserRequest(request);
    if (!resolution) return reply.redirect("/admin/");
    return resolve(repository, request, reply, resolution);
  });

  app.get("/:name", async (request, reply) =>
    resolve(repository, request, reply, pathRequest(request, false)),
  );
  app.get("/:name/*", async (request, reply) =>
    resolve(repository, request, reply, pathRequest(request, true)),
  );
}
