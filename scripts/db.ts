#!/usr/bin/env tsx
/**
 * Shared database helpers for local scripts.
 * Loads `.env.local` then `.env` (same order as Next.js) and opens the
 * postgres.js / Drizzle clients scripts use, so no script re-implements env
 * loading or connection setup.
 */
import {
  createPostgresClient,
  type DrizzleDb,
  getDrizzle,
} from "@complyloop/db/postgres";

import { loadLocalEnv } from "./env";

export { loadLocalEnv, getDrizzle };
export type { DrizzleDb };

/**
 * Loads local env then returns a trimmed DATABASE_URL, exiting with status 1
 * (printing `message`) when it is unset. The message keeps each caller's
 * original wording.
 */
export function requireDatabaseUrl(message: string): string {
  loadLocalEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(message);
    process.exit(1);
  }
  return url;
}

/** Opens a short-lived postgres.js client for a script (default pool of 1). */
export function openScriptClient(
  url: string,
  max = 1,
): ReturnType<typeof createPostgresClient> {
  return createPostgresClient(url, { max });
}
