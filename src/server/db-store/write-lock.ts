import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./client";

/**
 * Stable advisory-lock key for whole-Db writers (load → mutate → save).
 * Chosen once; must not collide with other app locks.
 */
const STORE_ADVISORY_LOCK_KEY = 748_291_063;

let writeTail: Promise<void> = Promise.resolve();

/**
 * Serializes store writers in this process. Concurrent callers queue;
 * each runs exclusively after the previous finishes (success or failure).
 */
export function withProcessWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeTail.then(fn, fn);
  writeTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Transaction-scoped Postgres advisory lock for multi-instance writers. */
export async function withPostgresAdvisoryLock<T>(
  drizzle: DrizzleDb,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${STORE_ADVISORY_LOCK_KEY})`,
    );
    return fn(tx as unknown as DrizzleDb);
  });
}
