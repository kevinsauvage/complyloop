#!/usr/bin/env tsx
/**
 * Applies SQL migrations in drizzle/ against DATABASE_URL (in filename order).
 * Loads `.env.local` then `.env` (same as local Next.js) when the var is unset.
 * Usage: npm run db:migrate
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createPostgresClient } from "../src/server/db-store/postgres-url";

function loadLocalEnv(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  loadEnv({ path: path.join(process.cwd(), ".env.local") });
  if (!process.env.DATABASE_URL?.trim()) {
    loadEnv({ path: path.join(process.cwd(), ".env") });
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "DATABASE_URL is required. Set it in .env.local or the environment.",
    );
    process.exit(1);
  }
  const dir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const sql = await createPostgresClient(url, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_complyloop_migrations" (
        "id" text PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    for (const file of files) {
      const applied = await sql<{ id: string }[]>`
        SELECT id FROM "_complyloop_migrations" WHERE id = ${file}
      `;
      if (applied.length > 0) {
        console.log("skip", file);
        continue;
      }
      const body = fs.readFileSync(path.join(dir, file), "utf8");
      await sql.unsafe(body);
      await sql`
        INSERT INTO "_complyloop_migrations" (id) VALUES (${file})
      `;
      console.log("Applied", file);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
