#!/usr/bin/env tsx
/**
 * Destroys all app data in DATABASE_URL and re-applies migrations.
 * Dev / pre-launch only — refuses without --confirm.
 *
 * Usage: npm run db:reset -- --confirm
 */
import { createPostgresClient } from "@complyloop/db/postgres-url";
import { applyPendingMigrations } from "./db-migrate";
import { loadLocalEnv } from "./env";

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "Refusing to wipe the database. Re-run with: npm run db:reset -- --confirm",
    );
    process.exit(1);
  }

  loadLocalEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "DATABASE_URL is required. Set it in .env.local or the environment.",
    );
    process.exit(1);
  }

  // Hide credentials in logs.
  let hostLabel = "database";
  try {
    hostLabel = new URL(url).host;
  } catch {
    /* keep default */
  }

  console.log(`Resetting Postgres at ${hostLabel} …`);
  const sql = await createPostgresClient(url, { max: 1 });
  try {
    await sql.unsafe(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
      GRANT ALL ON SCHEMA public TO CURRENT_USER;
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("Schema dropped. Applying migrations…");
  await applyPendingMigrations(url);
  console.log("Database reset complete. Sign out, clear site cookies, sign in again.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
