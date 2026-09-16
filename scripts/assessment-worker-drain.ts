#!/usr/bin/env tsx
/**
 * GitHub Actions executor: claim + run queued assessment jobs until the
 * queue is idle or `limit` jobs have been attempted.
 *
 * Run with `npm run worker:drain` (`tsx --conditions=react-server`, so
 * `server-only` imports resolve — same flag as every tsx script). Per-job
 * failures (including retries) are recorded in Postgres and reported to
 * Sentry by the worker itself; this script exits non-zero only when the
 * batch itself crashes (DB down, missing env) so the workflow run reflects
 * infra health, not assessment outcomes.
 */
import { runAssessmentJobBatch } from "../src/server/assessment/assessment-runner";
import { loadLocalEnv } from "./env";

loadLocalEnv();

function numeric(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const missing = ["DATABASE_URL", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}.`);
  }
  const limit = numeric("ASSESSMENT_WORKER_LIMIT", 10);
  const concurrency = numeric("ASSESSMENT_WORKER_CONCURRENCY", 2);

  const startedAt = Date.now();
  const results = await runAssessmentJobBatch({ limit, concurrency });
  const byKind: Record<string, number> = {};
  for (const result of results) {
    byKind[result.kind] = (byKind[result.kind] ?? 0) + 1;
  }
  console.info(
    JSON.stringify({
      status: "worker batch finished",
      limit,
      concurrency,
      ...byKind,
      ms: Date.now() - startedAt,
      at: new Date().toISOString(),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
