#!/usr/bin/env tsx
/**
 * Applies SQL migrations in drizzle/ against DATABASE_URL (in filename order).
 * Loads local `.env` files when the var is unset (`./db`).
 * Usage: npm run db:migrate
 *
 * Runs inside a Postgres advisory lock so concurrent invocations (e.g. a
 * migration step overlapping the next deploy) serialize instead of racing on
 * the check-then-apply loop. As a rule, run migrations as a dedicated deploy
 * step — not from the app container's start command.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { openScriptClient, requireDatabaseUrl } from "./db";

// Deterministic per-database lock key for serializing migrations across
// processes. hashtext makes it stable without hand-picking a magic number.
const MIGRATION_LOCK = "hashtext('_complyloop_migrations')::bigint";

async function applyMigrations(
  url: string,
  dir: string,
  files: string[],
): Promise<void> {
  const sql = await openScriptClient(url, 1);
  try {
    // Serialize against any other migration process (replica starts, the
    // deploy step, an overlapping deploy). Session-scoped, so a crashed
    // migrator releases the lock automatically when its connection drops.
    await sql.unsafe(`SELECT pg_advisory_lock(${MIGRATION_LOCK});`);
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
      // One transaction per file: a multi-statement body that fails midway
      // rolls back completely and stays unrecorded, so the retry re-applies
      // from a clean state instead of hitting half-created DDL. The
      // session-scoped advisory lock above still serializes whole runs (so
      // ordered files never interleave across processes).
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          INSERT INTO "_complyloop_migrations" (id) VALUES (${file})
        `;
      });
      console.log("Applied", file);
    }
  } finally {
    await sql
      .unsafe(`SELECT pg_advisory_unlock(${MIGRATION_LOCK});`)
      .catch(() => {
        // Lock may already be gone if the connection died mid-run.
      });
    await sql.end({ timeout: 5 });
  }
}

export async function applyPendingMigrations(url: string): Promise<void> {
  const dir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  await applyMigrations(url, dir, files);
}

async function main(): Promise<void> {
  const url = requireDatabaseUrl(
    "DATABASE_URL is required. Set it in .env.local or the environment.",
  );
  await applyPendingMigrations(url);
}

// Only auto-run when invoked directly (`tsx scripts/db-migrate.ts`), not when
// imported (e.g. `db-reset.ts` reuses `applyPendingMigrations` in-process).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
