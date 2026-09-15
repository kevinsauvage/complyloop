import "server-only";

/** Persistent sliding-window rate limits for expensive server actions. */
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  getDrizzle,
  withNamedPostgresAdvisoryLock,
} from "@complyloop/db/postgres";
import {
  pruneRateLimitBuckets as pruneBuckets,
  tryConsumeRateLimitSlot,
} from "@complyloop/db/repo/rate-limit";

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
  const consumed = await withNamedPostgresAdvisoryLock(
    drizzle,
    `rate-limit:${key}`,
    async (tx) => tryConsumeRateLimitSlot(tx, key, limit, windowMs),
  );
  if (!consumed) throw new RateLimitError();
}

/** Removes expired windows; `runAssessmentJobBatch` calls this once per batch. */
export async function pruneRateLimitBuckets(
  maxAgeMs = 86_400_000,
): Promise<number> {
  return pruneBuckets(await getDrizzle(), maxAgeMs);
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
