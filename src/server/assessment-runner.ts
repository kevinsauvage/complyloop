import {
  processNextAssessmentJob,
  type AssessmentWorkerResult,
} from "./assessment-worker";

export type { AssessmentWorkerResult };

/**
 * Claims and runs ready assessment jobs until the queue is idle or `limit`
 * jobs have been attempted. The single batch loop shared by the scheduler API
 * route, the standalone worker script, and the in-request inline drain.
 */
export async function runAssessmentJobBatch(
  limit: number,
): Promise<AssessmentWorkerResult[]> {
  const results: AssessmentWorkerResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextAssessmentJob();
    results.push(result);
    if (result.kind === "idle") break;
  }
  return results;
}
