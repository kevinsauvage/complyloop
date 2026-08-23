import { processNextAssessmentJob } from "./assessment-worker";
import { isE2EHarnessEnabled } from "./e2e-harness";

/**
 * Process jobs in-process when a dedicated worker is not expected —
 * local `next dev`, and Playwright (`E2E_AUTH_ENABLED=1` + `next start`).
 */
export function shouldDrainAssessmentJobsInline(): boolean {
  return process.env.NODE_ENV === "development" || isE2EHarnessEnabled();
}

/** Claims and runs ready jobs until the queue is idle or `maxJobs` is reached. */
export async function drainAssessmentJobQueue(maxJobs = 20): Promise<void> {
  for (let index = 0; index < maxJobs; index += 1) {
    const result = await processNextAssessmentJob();
    if (result.kind === "idle") return;
  }
}
