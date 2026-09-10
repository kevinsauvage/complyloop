import "server-only";
import {
  processNextAssessmentJob,
  type AssessmentWorkerResult,
} from "./assessment-worker";

export type { AssessmentWorkerResult };

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

async function runSequential(limit: number): Promise<AssessmentWorkerResult[]> {
  const results: AssessmentWorkerResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextAssessmentJob();
    results.push(result);
    if (result.kind === "idle") break;
  }
  return results;
}

/**
 * Claims and runs ready assessment jobs until the queue is idle or `limit`
 * jobs have been attempted. The single batch loop shared by the scheduler API
 * route, the standalone worker script, and the in-request inline drain.
 *
 * Pass `concurrency` > 1 to run a bounded in-process pool. Per-project
 * exclusivity is enforced by `claimNextAssessmentJob` (correlated NOT EXISTS
 * plus `FOR UPDATE SKIP LOCKED`), so pool workers can never race the same
 * project — they only add throughput across independent projects.
 */
export async function runAssessmentJobBatch(
  optionsOrLimit: number | AssessmentJobBatchOptions,
): Promise<AssessmentWorkerResult[]> {
  const options =
    typeof optionsOrLimit === "number"
      ? { limit: optionsOrLimit }
      : optionsOrLimit;
  const limit = Math.max(1, options.limit);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, limit));
  if (concurrency === 1) return runSequential(limit);

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
