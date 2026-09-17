import { sql } from "drizzle-orm";

import { getDrizzle } from "@complyloop/db/postgres";

import { queuedAssessmentJobCount } from "@/server/assessment/assessment-jobs";
import { reportWarning } from "@/server/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short cache for healthy responses: the probe is an unauthenticated scrape
 * target, so a burst of scrapes must not fan out into Postgres. Only 200s
 * are cached (10s) — 503s always run live so a down database reports
 * immediately. Bypassed in tests for determinism.
 */
const HEALTH_CACHE_TTL_MS = 10_000;

let cached: { at: number; body: Record<string, unknown> } | null = null;

/** Test-only reset for the module-level healthy-response cache. */
export function __resetHealthCacheForTests(): void {
  cached = null;
}

/**
 * Liveness + readiness: process is up and Postgres answers SELECT 1.
 * Returns 503 when the database is unreachable so load balancers can drain.
 */
export async function GET(): Promise<Response> {
  const started = Date.now();
  if (
    process.env.NODE_ENV !== "test" &&
    cached &&
    started - cached.at < HEALTH_CACHE_TTL_MS
  ) {
    return Response.json(cached.body, { status: 200 });
  }
  try {
    const drizzle = await getDrizzle();
    const [, queuedJobs] = await Promise.all([
      drizzle.execute(sql`SELECT 1`),
      queuedAssessmentJobCount(),
    ]);
    const body = {
      status: "ok",
      database: "up",
      assessmentJobs: queuedJobs,
      latencyMs: Date.now() - started,
    };
    if (process.env.NODE_ENV !== "test") {
      cached = { at: started, body };
    }
    return Response.json(body, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database unavailable.";
    reportWarning(message, { code: "health_database_down" });
    return Response.json(
      {
        status: "unavailable",
        database: "down",
        error: "Database unavailable.",
        latencyMs: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
