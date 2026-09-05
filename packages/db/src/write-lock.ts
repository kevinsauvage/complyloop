import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./client.ts";

/** Serialize interactive writes and assessment apply for one project. */
export function projectWriteLockKey(projectId: string): string {
  return `project-write:${projectId}`;
}

/** Serialize a user's org-scoped writes (membership/org row mutations). */
export function orgWriteLockKey(userId: string): string {
  return `org-write:${userId}`;
}

/** Holds until the surrounding transaction commits or rolls back. */
export async function acquireNamedPostgresAdvisoryLock(
  tx: DrizzleDb,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/** Per-resource advisory lock (e.g. rate-limit buckets). */
export async function withNamedPostgresAdvisoryLock<T>(
  drizzle: DrizzleDb,
  key: string,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, key);
    return fn(tx);
  });
}
