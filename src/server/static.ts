import { existsSync } from "node:fs";
import path from "node:path";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

export async function registerAdminAssets(app: FastifyInstance): Promise<boolean> {
  const root = path.resolve(process.cwd(), "dist/public");
  const index = path.join(root, "index.html");
  if (!existsSync(index)) return false;

  await app.register(fastifyStatic, {
    root,
    prefix: "/admin/",
    decorateReply: true,
    wildcard: false,
    cacheControl: false,
    setHeaders(response, filePath) {
      const assetsRoot = `${path.join(root, "assets")}${path.sep}`;
      response.setHeader(
        "Cache-Control",
        filePath.startsWith(assetsRoot) ? "public, max-age=31536000, immutable" : "no-cache",
      );
    },
  });
  app.get("/admin", async (_request, reply) => reply.redirect("/admin/"));
  app.get("/admin/assets/*", async (_request, reply) =>
    reply
      .code(404)
      .header("Cache-Control", "no-store")
      .send({ error: { code: "NOT_FOUND", message: "Static asset not found." } }),
  );
  app.get("/admin/*", async (_request, reply) =>
    reply.header("Cache-Control", "no-cache").sendFile("index.html"),
  );
  return true;
}
