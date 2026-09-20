import "server-only";

import { isE2EHarnessEnabled } from "../e2e-harness";
import { reportWarning } from "../observability";
import { pruneRateLimitBuckets } from "../rate-limit";
import { dispatchAssessmentWorker } from "./assessment-job-dispatch";
import type { AssessmentWorkerResult } from "./assessment-worker";

export type { AssessmentWorkerResult };

/**
 * Single default drain size, consumed by the GH drain script, the workflow
 * docs, and the dev/e2e inline path. There is no Vercel scan route (the old
 * curl sweep was retired), so the GitHub Actions executor is the only drain
 * path and this one default applies everywhere.
 */
export const ASSESSMENT_DRAIN_DEFAULTS = {
  limit: 10,
  concurrency: 2,
} as const;

export interface AssessmentJobBatchOptions {
  /** Max jobs to attempt in this batch. */
  limit: number;
  /**
   * Max jobs to run concurrently within this process (default 1). Claims are
   * per-project-exclusive in Postgres, so a pool is safe; keep it small since
   * each assessment clones a repo and may drive a browser.
   */
  concurrency?: number;
}

/**
 * Module-boundary contract (documented once, here): trigger sites
 * (`actions/assessment.ts`, the webhook route) import only
 * `scheduleAssessmentDrain` / `shouldDrainAssessmentJobsInline` from this
 * module and must never statically reach the scan stack. The batch loop
 * below therefore reaches `assessment-worker.ts` (and the teardown reaches
 * the browser/DB singletons) through dynamic `import()` — the static graph
 * of this module is dispatch + harness + rate-limit + observability only.
 */
async function runSequential(
  runNext: () => Promise<AssessmentWorkerResult>,
  limit: number,
): Promise<AssessmentWorkerResult[]> {
  const results: AssessmentWorkerResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await runNext();
    results.push(result);
    if (result.kind === "idle") break;
  }
  return results;
}

/**
 * Claims and runs ready assessment jobs until the queue is idle or `limit`
 * jobs have been attempted. The single batch loop shared by the GH Actions
 * drain script and the dev/e2e inline drain.
 *
 * Pass `concurrency` > 1 to run a bounded in-process pool. Per-project
 * exclusivity is enforced by `claimNextAssessmentJob` (correlated NOT EXISTS
 * plus `FOR UPDATE SKIP LOCKED`), so pool workers can never race the same
 * project — they only add throughput across independent projects.
 *
 * Expired rate-limit buckets are pruned once per batch (one cheap DELETE, so
 * a continuously busy queue cannot grow the table unbounded, and idle ticks
 * don't write on every poll).
 */
export async function runAssessmentJobBatch(
  optionsOrLimit: number | AssessmentJobBatchOptions,
): Promise<AssessmentWorkerResult[]> {
  try {
    await pruneRateLimitBuckets();
    // Webhook delivery idempotency keys accumulate forever otherwise: keep
    // the last 10k (far beyond any redelivery window) via dynamic import so
    // this module's static graph stays dispatch + harness + rate-limit +
    // observability (see the boundary contract above).
    const { pruneWebhookDeliveryRows } =
      await import("@complyloop/db/repo/webhook-deliveries");
    const { getDrizzle } = await import("@complyloop/db/postgres");
    await pruneWebhookDeliveryRows(await getDrizzle(), 10_000);
  } catch (error) {
    reportWarning("Batch prune failed.", {
      code: "batch_prune_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const { processNextAssessmentJob } = await import("./assessment-worker");
  const options =
    typeof optionsOrLimit === "number"
      ? { limit: optionsOrLimit }
      : optionsOrLimit;
  const limit = Math.max(1, options.limit);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, limit));
  if (concurrency === 1) return runSequential(processNextAssessmentJob, limit);

  const results: AssessmentWorkerResult[] = [];
  let claimBudget = limit;
  let queueIdle = false;

  async function worker(): Promise<void> {
    while (!queueIdle && claimBudget > 0) {
      claimBudget -= 1;
      const result = await processNextAssessmentJob();
      results.push(result);
      if (result.kind === "idle") {
        // No claimable job right now (empty queue, or every ready project is
        // already running) — stop the pool instead of spinning.
        queueIdle = true;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/**
 * Long-lived executor teardown (GitHub Actions drain script): close the
 * cached browser and the DB pool so the process can exit after the batch
 * summary prints. Serverless invocations never call this — the container
 * dies with the request. Best-effort and never throws; the caller still
 * exits with its own code.
 */
export async function closeAssessmentWorker(): Promise<void> {
  try {
    const { closeRuntimeBrowser } =
      await import("@complyloop/analysis-core/runtime/scan");
    await closeRuntimeBrowser();
  } catch (error) {
    reportWarning("Assessment worker browser close failed.", {
      code: "assessment_worker_teardown_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const { closeDrizzle } = await import("@complyloop/db/postgres");
    await closeDrizzle();
  } catch (error) {
    reportWarning("Assessment worker DB close failed.", {
      code: "assessment_worker_teardown_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Process jobs in-process when a dedicated worker is not expected —
 * local `next dev`, and Playwright (`E2E_AUTH_ENABLED=1` + `next start`).
 */
export function shouldDrainAssessmentJobsInline(): boolean {
  return process.env.NODE_ENV === "development" || isE2EHarnessEnabled();
}

export interface DrainAssessmentJobsResult {
  ran: number;
  failed: number;
  retrying: number;
  cancelled: number;
}

/**
 * Claims and runs ready jobs until the queue is idle or the drain limit is
 * reached. Single batch loop — the per-kind recount is the only thing this
 * wrapper adds over `runAssessmentJobBatch`. Sequential by default (the
 * inline path always was); pass `concurrency` explicitly for pooled drains.
 */
export async function drainQueue(
  options: AssessmentJobBatchOptions = {
    limit: ASSESSMENT_DRAIN_DEFAULTS.limit,
  },
): Promise<DrainAssessmentJobsResult> {
  const outcome: DrainAssessmentJobsResult = {
    ran: 0,
    failed: 0,
    retrying: 0,
    cancelled: 0,
  };
  for (const result of await runAssessmentJobBatch(options)) {
    if (result.kind === "succeeded") outcome.ran += 1;
    else if (result.kind === "failed") outcome.failed += 1;
    else if (result.kind === "retrying") outcome.retrying += 1;
    else if (result.kind === "cancelled") outcome.cancelled += 1;
  }
  return outcome;
}

/**
 * Dev/e2e-only inline drain for `scheduleAssessmentDrain`: drains the queue
 * and maps the outcome to user copy.
 */
export async function drainAssessmentJobsInline(): Promise<string> {
  const outcome = await drainQueue();
  if (outcome.ran > 0) {
    return "Assessment complete.";
  }
  if (outcome.cancelled > 0) {
    return "Assessment cancelled.";
  }
  if (outcome.failed > 0 && outcome.retrying > 0) {
    return `${outcome.failed} assessment job${outcome.failed === 1 ? "" : "s"} failed and ${outcome.retrying} will retry.`;
  }
  if (outcome.failed > 0) {
    return `${outcome.failed} assessment job${outcome.failed === 1 ? "" : "s"} failed. Check the server logs for details.`;
  }
  if (outcome.retrying > 0) {
    return "Assessment hit an error and will retry automatically.";
  }
  return "No assessment jobs were ready to run.";
}

/**
 * Single scheduling entry point for the **queued** path (webhook and manual).
 * Call it inside `after()` in production; `await` it directly only on the
 * dev/e2e inline path (it runs the scan there and returns the user-facing
 * message).
 *
 * Manual runs come through here too — `runAssessmentAction` enqueues and
 * then drains via this scheduler, so the dashboard request never hosts the
 * scan itself (the 300s serverless ceiling killed direct runs).
 *
 * Dev/e2e drains the queue inline and returns the user-facing message;
 * production kicks the GitHub Actions executor (`repository_dispatch`) and
 * returns `undefined`, so the caller falls back to the "queued" copy. A
 * dispatch that is unconfigured or rejected leaves the job `queued` — the
 * executor's 15-minute schedule reclaims it via lease recovery, so there is
 * no second executor path to maintain.
 *
 * Never throws — a failed dispatch leaves the job `queued` and the
 * scheduled worker reclaims it via lease recovery.
 */
export async function scheduleAssessmentDrain(): Promise<string | undefined> {
  if (shouldDrainAssessmentJobsInline()) {
    return drainAssessmentJobsInline();
  }
  await dispatchAssessmentWorker();
  return undefined;
}
