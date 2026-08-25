import { z } from "zod";

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  MIGRATION_DATABASE_URL: z.string().url().optional().or(z.literal("")),
  PUBLIC_BASE_URL: z.string().url().default("http://go.localhost"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: booleanFromEnvironment,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(600).default(20),
});

export type AppConfig = {
  databaseUrl: string;
  migrationDatabaseUrl?: string;
  publicBaseUrl: string;
  port: number;
  host: string;
  logLevel: z.infer<typeof environmentSchema>["LOG_LEVEL"];
  trustProxy: boolean;
  dbPoolMax: number;
  dbIdleTimeoutSeconds: number;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(result.error)}`);
  }

  const value = result.data;
  return {
    databaseUrl: value.DATABASE_URL,
    migrationDatabaseUrl: value.MIGRATION_DATABASE_URL || undefined,
    publicBaseUrl: value.PUBLIC_BASE_URL,
    port: value.PORT,
    host: value.HOST,
    logLevel: value.LOG_LEVEL,
    trustProxy: value.TRUST_PROXY,
    dbPoolMax: value.DB_POOL_MAX,
    dbIdleTimeoutSeconds: value.DB_IDLE_TIMEOUT_SECONDS,
  };
}
