import { getDrizzle } from "@/server/db-store/client";
import { sql } from "drizzle-orm";

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
    await drizzle.execute(sql`SELECT 1`);
    return Response.json(
      {
        status: "ok",
        database: "up",
        latencyMs: Date.now() - started,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database unavailable.";
    return Response.json(
      {
        status: "unavailable",
        database: "down",
        error: message,
        latencyMs: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
