import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDatabaseClient } from "./db/client";
import { PostgresRouteRepository } from "./repository";

const config = loadConfig();
const database = createDatabaseClient(config);
const repository = new PostgresRouteRepository(database);
const app = await buildApp({ repository, config });

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ error }, "Unable to start server");
  await app.close();
  process.exit(1);
}
