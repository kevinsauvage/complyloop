import "server-only";

/** Persistent sliding-window rate limits for expensive server actions. */
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  type DrizzleDb,
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
 *
 * `db` lets a caller already inside a transaction (and therefore already
 * holding a pool connection) run the check on that connection instead of
 * taking a second one — three concurrent actions otherwise deadlock a
 * small pool waiting for a connection they cannot get.
 *
 * Trade-off: on a caller transaction the slot and the advisory lock live until
 * that transaction commits, so a failed action refunds its slot and same-user
 * actions serialize for the duration of their project transaction. Lock order
 * is always project → rate-limit (never the reverse), so this cannot deadlock;
 * abuse limits are enforced on successful work, which is the expensive path.
 */
export async function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  db?: DrizzleDb,
): Promise<void> {
  const drizzle = db ?? (await getDrizzle());
  const consumed = await withNamedPostgresAdvisoryLock(
    drizzle,
    `rate-limit:${key}`,
    async (tx) => tryConsumeRateLimitSlot(tx, key, limit, windowMs),
  );
  if (!consumed) throw new RateLimitError();
}

export async function pruneRateLimitBuckets(
  maxAgeMs = 86_400_000,
): Promise<number> {
  return pruneBuckets(await getDrizzle(), maxAgeMs);
}

export function assertConnectRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`connect:${userId}`, 10, 60_000);
}

export function assertAssessRateLimit(
  userId: string,
  db?: DrizzleDb,
): Promise<void> {
  return assertRateLimit(`assess:${userId}`, 6, 60_000, db);
}

export function assertAiRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`ai:${userId}`, 20, 60_000);
}

export function assertRemediationRateLimit(
  userId: string,
  db?: DrizzleDb,
): Promise<void> {
  return assertRateLimit(`remediation:${userId}`, 30, 60_000, db);
}

export function assertRequirementsRateLimit(
  userId: string,
  db?: DrizzleDb,
): Promise<void> {
  return assertRateLimit(`requirements:${userId}`, 30, 60_000, db);
}

export function assertRuntimeAuditRateLimit(
  userId: string,
  db?: DrizzleDb,
): Promise<void> {
  return assertRateLimit(`runtime-audit:${userId}`, 20, 60_000, db);
}

/** Org creation: 5 per user per hour (org sprawl is the abuse mode). */
export function assertOrgCreateRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`org-create:${userId}`, 5, 3_600_000);
}

/** Org invites: 20 per user per minute (invite spam). */
export function assertOrgInviteRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`org-invite:${userId}`, 20, 60_000);
}

/** Full-org evidence export: 10 per user per minute (5000-row reads). */
export function assertExportRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`export:${userId}`, 10, 60_000);
}

/** Draft PR creation (force-push + pull request API): 10 per user per hour. */
export function assertPrRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`pr:${userId}`, 10, 3_600_000);
}

/** Repo picker typeahead: 30 per user per minute (each fans out to GitHub). */
export function assertReposRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`repos:${userId}`, 30, 60_000);
}

/** Assessment-job polling: 60 per user per minute (client ticks every ~3s). */
export function assertJobPollRateLimit(userId: string): Promise<void> {
  return assertRateLimit(`job-poll:${userId}`, 60, 60_000);
}
