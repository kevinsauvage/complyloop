import { sql } from "drizzle-orm";

import { getDrizzle } from "@complyloop/db/postgres";

import { queuedAssessmentJobCount } from "@/server/assessment/assessment-jobs";
import { reportWarning } from "@/server/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness: process is up and Postgres answers SELECT 1.
 * Returns 503 when the database is unreachable so load balancers can drain.
 */
export async function GET(): Promise<Response> {
  const started = Date.now();
  try {
    const drizzle = await getDrizzle();
    const [, queuedJobs] = await Promise.all([
      drizzle.execute(sql`SELECT 1`),
      queuedAssessmentJobCount(),
    ]);
    return Response.json(
      {
        status: "ok",
        database: "up",
        assessmentJobs: queuedJobs,
        latencyMs: Date.now() - started,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable.";
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
