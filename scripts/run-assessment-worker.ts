#!/usr/bin/env tsx
/** Runs one durable assessment worker process outside the web request path. */
import { processNextAssessmentJob } from "../src/server/assessment-worker";
import { pruneRateLimitBuckets } from "../src/server/rate-limit";
import { loadLocalEnv } from "./env";

loadLocalEnv();

const pollMs = Math.max(1_000, Number(process.env.WORKER_POLL_MS ?? 5_000));
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
    const result = await processNextAssessmentJob();
    await maybePruneRateLimitBuckets();
    if (result.kind === "idle") await sleep(pollMs);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
