import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://go_router:go_router@localhost:5432/go_router",
  },
  migrations: {
    schema: "go_router_meta",
    table: "migrations",
  },
});
