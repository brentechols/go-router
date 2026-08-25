import postgres, { type Sql } from "postgres";

import type { AppConfig } from "../config";

export type DatabaseClient = Sql<Record<string, unknown>>;

export function createDatabaseClient(
  config: Pick<AppConfig, "databaseUrl" | "dbPoolMax" | "dbIdleTimeoutSeconds">,
): DatabaseClient {
  return postgres(config.databaseUrl, {
    max: config.dbPoolMax,
    idle_timeout: config.dbIdleTimeoutSeconds,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
}
