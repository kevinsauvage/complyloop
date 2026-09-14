import "server-only";

import { isE2EHarnessEnabled } from "../e2e-harness";
import { runAssessmentJobBatch } from "./assessment-runner";

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

/**
 * Dev/e2e-only inline drain for the assessment action: drains the queue and
 * maps the outcome to user copy. Production never calls this (the worker
 * owns the queue); the action branches on `shouldDrainAssessmentJobsInline`
 * so the prod path stays a plain enqueue.
 */
export async function drainAssessmentJobsInline(): Promise<string> {
  const outcome = await drainAssessmentJobQueue();
  if (outcome.ran > 0) {
    return "Assessment complete.";
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
