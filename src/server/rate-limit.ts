/** Persistent sliding-window rate limits for expensive server actions. */

import { eq, lt } from "drizzle-orm";
import { PublicError } from "@complyloop/db/types";
import { getDrizzle } from "@complyloop/db/client";
import { rateLimitBuckets } from "@complyloop/db/schema";
import { withNamedPostgresAdvisoryLock } from "@complyloop/db/write-lock";

export class RateLimitError extends PublicError {
  constructor(message = "Too many requests. Try again shortly.") {
    super(message, "rate_limit");
    this.name = "RateLimitError";
  }
}

/**
 * Atomically consumes one slot from a shared Postgres window. A keyed advisory
 * lock avoids a read/modify/write race without serializing unrelated users.
 *
 * The lock IS the correctness argument: the insert branch resets the window
 * with `count: 1` on conflict, which would silently swallow a concurrent
 * increment if two writers could reach it for the same key. They cannot —
 * the per-key lock serializes them. Do not remove the lock without replacing
 * this reset with an atomic upsert increment.
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

    if (existing.count >= limit) throw new RateLimitError();
    await tx
      .update(rateLimitBuckets)
      .set({ count: existing.count + 1, updatedAt: nowString })
      .where(eq(rateLimitBuckets.key, key));
  });
}

/** Removes expired windows; the worker calls this on idle ticks. */
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
