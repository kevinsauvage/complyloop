import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./client";

const STORE_WRITE_LOCK_KEY = 748_291_063;

/** Serializes job enqueue/claim and other cross-process critical sections. */
export async function withPostgresAdvisoryLock<T>(
  drizzle: DrizzleDb,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${STORE_WRITE_LOCK_KEY})`);
    return fn(tx);
  });
}

/** Per-resource advisory lock (e.g. rate-limit buckets). */
export async function withNamedPostgresAdvisoryLock<T>(
  drizzle: DrizzleDb,
  key: string,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
    return fn(tx);
  });
}
