#!/usr/bin/env tsx
/**
 * GitHub Actions executor: claim + run queued assessment jobs in batches
 * until the queue is idle or the wall-clock budget (`ASSESSMENT_WORKER_MAX_MS`,
 * default 20 min) runs out. `ASSESSMENT_WORKER_LIMIT` is the per-batch claim
 * size, not a total.
 *
 * Run with `npm run worker:drain` (builds the esbuild bundle, then plain
 * Node — see `scripts/build-worker.mjs` for why tsx cannot drive it).
 * Per-job failures (including retries) are recorded in Postgres and
 * reported to Sentry by the worker itself; this script exits non-zero only
 * when the batch itself crashes (DB down, missing env) so the workflow run
 * reflects infra health, not assessment outcomes.
 *
 * Always tears down (browser + DB pool) and exits explicitly: without this
 * the process survives the batch on open handles and the workflow hangs
 * until the job timeout.
 */
import path from "node:path";

import { releaseInFlightAssessmentJobs } from "../src/server/assessment/assessment-jobs";
import {
  ASSESSMENT_DRAIN_DEFAULTS,
  type AssessmentWorkerResult,
  runAssessmentJobBatch,
} from "../src/server/assessment/assessment-scheduler";
import { closeAssessmentWorker } from "../src/server/assessment/assessment-worker";
import { loadLocalEnv } from "./env";

function numeric(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function main(): Promise<void> {
  // Local-only env files; never override the runner's secrets (dotenv does
  // not override by default, and this stays inside main so importing this
  // module — e.g. in tests — has no env side effects).
  loadLocalEnv();
  const missing = [
    "DATABASE_URL",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
  ].filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}.`);
  }
  const limit = numeric(
    "ASSESSMENT_WORKER_LIMIT",
    ASSESSMENT_DRAIN_DEFAULTS.limit,
  );
  const concurrency = numeric(
    "ASSESSMENT_WORKER_CONCURRENCY",
    ASSESSMENT_DRAIN_DEFAULTS.concurrency,
  );
  const maxMs = numeric(
    "ASSESSMENT_WORKER_MAX_MS",
    ASSESSMENT_DRAIN_DEFAULTS.maxMs,
  );

  // `limit` bounds one batch (claim size + in-process pool width). The queue is
  // drained batch after batch until it goes idle or the wall-clock budget runs
  // out, so a backlog larger than `limit` no longer waits for the next tick —
  // the previous behaviour left jobs queued behind a 15-minute schedule.
  const startedAt = Date.now();
  const deadline = startedAt + maxMs;
  const results: AssessmentWorkerResult[] = [];
  let batches = 0;
  let budgetExhausted = false;
  for (;;) {
    const batch = await runAssessmentJobBatch({
      limit,
      concurrency,
      deadlineAt: deadline,
      // One drain prunes once, not once per batch.
      prune: batches === 0,
    });
    batches += 1;
    results.push(...batch);
    // The batch stops claiming at the deadline; distinguish "queue empty"
    // from "budget spent" so the log says whether work is still waiting.
    if (Date.now() >= deadline) {
      budgetExhausted = true;
      break;
    }
    if (batch.length === 0 || batch.some((r) => r.kind === "idle")) break;
  }

  const byKind: Record<string, number> = {};
  for (const result of results) {
    byKind[result.kind] = (byKind[result.kind] ?? 0) + 1;
  }
  console.info(
    JSON.stringify({
      status: "worker batch finished",
      limit,
      concurrency,
      maxMs,
      batches,
      budgetExhausted,
      ...byKind,
      ms: Date.now() - startedAt,
      at: new Date().toISOString(),
    }),
  );
}

async function shutdown(code: number): Promise<never> {
  await closeAssessmentWorker();
  process.exit(code);
}

/**
 * Basename — not `import.meta.url`, which is void in the bundled worker.
 * Lets tests import `main` without executing the batch.
 */
function isDirectRun(): boolean {
  const entry = process.argv[1] ? path.basename(process.argv[1]) : "";
  return entry.startsWith("assessment-worker-drain");
}

/**
 * A fatal error outside any per-job handler (an unhandled rejection from a
 * browser callback, say) used to kill the process with the claimed job still
 * `running` until its 30-minute lease expired — the dashboard showed a scan
 * "running for 14 min" that no process owned. Hand the job back first, bounded
 * so a hung DB cannot keep a dead worker alive.
 */
async function crash(error: unknown): Promise<never> {
  console.error(error);
  const reason = `Worker crashed: ${error instanceof Error ? error.message : String(error)}`;
  await Promise.race([
    releaseInFlightAssessmentJobs(reason).catch(() => 0),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  process.exit(1);
}

if (isDirectRun()) {
  process.on("unhandledRejection", (error) => void crash(error));
  process.on("uncaughtException", (error) => void crash(error));
  main().then(
    () => shutdown(0),
    async (error: unknown) => {
      console.error(error);
      await shutdown(1);
    },
  );
}
