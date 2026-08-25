import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { loadConfig } from "./config";

const config = loadConfig();
const connection = postgres(config.migrationDatabaseUrl ?? config.databaseUrl, {
  max: 1,
  idle_timeout: config.dbIdleTimeoutSeconds,
  connect_timeout: 10,
});
const database = drizzle(connection);

try {
  // The pool is deliberately limited to one connection so the lock and every
  // migration statement run in the same PostgreSQL session.
  await connection`SELECT pg_advisory_lock(710027001)`;
  await migrate(database, {
    migrationsFolder: path.resolve(process.cwd(), "db/migrations"),
    migrationsSchema: "go_router_meta",
    migrationsTable: "migrations",
  });
  console.log("Database migrations applied successfully.");
} finally {
  try {
    await connection`SELECT pg_advisory_unlock(710027001)`;
  } finally {
    await connection.end({ timeout: 5 });
  }
}
