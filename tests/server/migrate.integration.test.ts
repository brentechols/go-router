import { spawn } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL ?? "";

function runMigration(): Promise<{ code: number | null; output: string }> {
  const tsxCli = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "src/server/migrate.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        MIGRATION_DATABASE_URL: databaseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

describe.skipIf(!databaseUrl)("migration command integration", () => {
  it("serializes concurrent idempotent migration commands", async () => {
    const results = await Promise.all([runMigration(), runMigration()]);

    for (const result of results) {
      expect(result.code, result.output).toBe(0);
      expect(result.output).toContain("Database migrations applied successfully.");
    }
  }, 20_000);
});
