/** Persistent sliding-window rate limits for expensive server actions. */

import { and, eq, lt, sql } from "drizzle-orm";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  getDrizzle,
  withNamedPostgresAdvisoryLock,
} from "@complyloop/db/postgres";
import { rateLimitBuckets } from "@complyloop/db/schema";

export class RateLimitError extends PublicError {
  constructor(message = "Too many requests. Try again shortly.") {
    super(message, "rate_limit");
    this.name = "RateLimitError";
  }
}

/**
 * Atomically consumes one slot from a shared Postgres window. A keyed advisory
 * lock serializes window resets; the increment itself is a conditional UPDATE
 * so count cannot undercount if a writer ever bypasses the lock.
 */
export async function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const drizzle = await getDrizzle();
  await withNamedPostgresAdvisoryLock(drizzle, `rate-limit:${key}`, async (tx) => {
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
      return;
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

    if (updated.length === 0) throw new RateLimitError();
  });
}

/** Removes expired windows; the worker loop calls this on a wall-clock cadence (plus once per idle tick inside processNextAssessmentJob). */
export async function pruneRateLimitBuckets(maxAgeMs = 86_400_000): Promise<number> {
  const drizzle = await getDrizzle();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const deleted = await drizzle
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.updatedAt, cutoff))
    .returning({ key: rateLimitBuckets.key });
  return deleted.length;
}

/** Connect / clone: 10 per user per minute. */
export function assertConnectRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`connect:${userId}`, 10, 60_000);
}

/** Assessment runs: 6 queued per user per minute. */
export function assertAssessRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`assess:${userId}`, 6, 60_000);
}

/** AI explain / remediate: 20 per user per minute. */
export function assertAiRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`ai:${userId}`, 20, 60_000);
}
