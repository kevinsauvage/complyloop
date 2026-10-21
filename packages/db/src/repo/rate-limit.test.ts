import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "../postgres.ts";
import {
  pruneRateLimitBuckets,
  tryConsumeRateLimitSlot,
} from "./rate-limit.ts";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("rate limit buckets", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("consumes up to the limit, then refuses until the window resets", async () => {
    const drizzle = await getDrizzle();
    const key = `test-rate-${Date.now()}`;
    try {
      expect(await tryConsumeRateLimitSlot(drizzle, key, 2, 60_000)).toBe(true);
      expect(await tryConsumeRateLimitSlot(drizzle, key, 2, 60_000)).toBe(true);
      expect(await tryConsumeRateLimitSlot(drizzle, key, 2, 60_000)).toBe(
        false,
      );
      // A zero-width window always counts as expired, so the next slot resets.
      expect(await tryConsumeRateLimitSlot(drizzle, key, 2, 0)).toBe(true);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM rate_limit_buckets WHERE key = ${key}`,
      );
    }
  });

  it("prunes buckets older than the retention window", async () => {
    const drizzle = await getDrizzle();
    const key = `test-rate-prune-${Date.now()}`;
    await drizzle.execute(sql`
      INSERT INTO rate_limit_buckets (key, window_started_at, count, updated_at)
      VALUES (${key}, '2020-01-01T00:00:00.000Z', 1, '2020-01-01T00:00:00.000Z')
    `);
    const pruned = await pruneRateLimitBuckets(drizzle, 60_000);
    expect(pruned).toBeGreaterThan(0);
    const rows = await drizzle.execute(
      sql`SELECT 1 FROM rate_limit_buckets WHERE key = ${key}`,
    );
    expect(rows.length).toBe(0);
  });
});
