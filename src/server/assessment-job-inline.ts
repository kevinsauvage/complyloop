import "server-only";

import { runAssessmentJobBatch } from "./assessment-runner";
import { isE2EHarnessEnabled } from "./e2e-harness";

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
}

/** Claims and runs ready jobs until the queue is idle or `maxJobs` is reached. */
export async function drainAssessmentJobQueue(
  maxJobs = 20,
): Promise<DrainAssessmentJobsResult> {
  const outcome: DrainAssessmentJobsResult = { ran: 0, failed: 0, retrying: 0 };
  for (const result of await runAssessmentJobBatch(maxJobs)) {
    if (result.kind === "succeeded") outcome.ran += 1;
    else if (result.kind === "failed") outcome.failed += 1;
    else if (result.kind === "retrying") outcome.retrying += 1;
  }
  return outcome;
}
