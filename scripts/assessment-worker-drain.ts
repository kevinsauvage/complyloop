#!/usr/bin/env tsx
/**
 * GitHub Actions executor: claim + run queued assessment jobs until the
 * queue is idle or `limit` jobs have been attempted.
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

import {
  ASSESSMENT_DRAIN_DEFAULTS,
  closeAssessmentWorker,
  runAssessmentJobBatch,
} from "../src/server/assessment/assessment-scheduler";
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
  const missing = ["DATABASE_URL", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}.`);
  }
  const limit = numeric("ASSESSMENT_WORKER_LIMIT", ASSESSMENT_DRAIN_DEFAULTS.limit);
  const concurrency = numeric(
    "ASSESSMENT_WORKER_CONCURRENCY",
    ASSESSMENT_DRAIN_DEFAULTS.concurrency,
  );

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

if (isDirectRun()) {
  main().then(
    () => shutdown(0),
    async (error: unknown) => {
      console.error(error);
      await shutdown(1);
    },
  );
}
