import { and, eq, lt, sql } from "drizzle-orm";

import type { DrizzleDb } from "../postgres.ts";
import { rateLimitBuckets } from "../schema.ts";

/**
 * Sliding-window rate-limit bucket storage. Pure persistence — limits and
 * error mapping live in `src/server/rate-limit.ts`.
 */
export async function tryConsumeRateLimitSlot(
  tx: DrizzleDb,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const nowString = now.toISOString();
  const [existing] = await tx
    .select()
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.key, key))
    .limit(1);

  if (!existing || now.getTime() - Date.parse(existing.windowStartedAt) >= windowMs) {
    await tx
      .insert(rateLimitBuckets)
      .values({
        key,
        windowStartedAt: nowString,
        count: 1,
        updatedAt: nowString,
      })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: { windowStartedAt: nowString, count: 1, updatedAt: nowString },
      });
    return true;
  }

  const updated = await tx
    .update(rateLimitBuckets)
    .set({
      count: sql`${rateLimitBuckets.count} + 1`,
      updatedAt: nowString,
    })
    .where(
      and(eq(rateLimitBuckets.key, key), lt(rateLimitBuckets.count, limit)),
    )
    .returning({ key: rateLimitBuckets.key });

  return updated.length > 0;
}

/** Removes expired windows; returns the number of pruned buckets. */
export async function pruneRateLimitBuckets(
  db: DrizzleDb,
  maxAgeMs = 86_400_000,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const deleted = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.updatedAt, cutoff))
    .returning({ key: rateLimitBuckets.key });
  return deleted.length;
}
