#!/usr/bin/env tsx
/** Runs one durable assessment worker process outside the web request path. */
import { runAssessmentJobBatch } from "../src/server/assessment/assessment-runner";
import { pruneRateLimitBuckets } from "../src/server/rate-limit";
import { loadLocalEnv } from "./env";

loadLocalEnv();

const pollMs = Math.max(1_000, Number(process.env.WORKER_POLL_MS ?? 5_000));
// Bounded in-process pool across independent projects. Default 1 preserves the
// historic one-job-per-process behavior; raise it to drain a backlog faster.
// Per-project exclusivity is enforced by `claimNextAssessmentJob`.
const concurrency = Math.max(
  1,
  Math.min(Number(process.env.WORKER_CONCURRENCY ?? 1) || 1, 8),
);
// `processNextAssessmentJob` prunes only when it happens to go idle, so a
// continuously busy worker would let rate_limit_buckets grow unbounded.
// Prune on a wall-clock cadence regardless of idle/busy instead.
const PRUNE_INTERVAL_MS = 10 * 60_000;
let lastPruneAt = 0;

async function maybePruneRateLimitBuckets(): Promise<void> {
  if (Date.now() - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = Date.now();
  try {
    await pruneRateLimitBuckets();
  } catch (error) {
    console.warn(
      "Rate-limit bucket prune failed:",
      error instanceof Error ? error.message : error,
    );
  }
}
let stopping = false;

function requestStop(): void {
  stopping = true;
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  while (!stopping) {
    const results = await runAssessmentJobBatch({
      limit: concurrency,
      concurrency,
    });
    await maybePruneRateLimitBuckets();
    const idle =
      results.length === 0 || results.every((result) => result.kind === "idle");
    if (idle) await sleep(pollMs);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
