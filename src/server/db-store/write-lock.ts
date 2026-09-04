import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./client";

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
