import "server-only";

import { isE2EHarnessEnabled } from "../e2e-harness";
import { reportEvent, reportWarning } from "../observability";
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
  cancelled: number;
}

/** Claims and runs ready jobs until the queue is idle or `maxJobs` is reached. */
export async function drainAssessmentJobQueue(
  maxJobs = 20,
): Promise<DrainAssessmentJobsResult> {
  const outcome: DrainAssessmentJobsResult = {
    ran: 0,
    failed: 0,
    retrying: 0,
    cancelled: 0,
  };
  for (const result of await runAssessmentJobBatch(maxJobs)) {
    if (result.kind === "succeeded") outcome.ran += 1;
    else if (result.kind === "failed") outcome.failed += 1;
    else if (result.kind === "retrying") outcome.retrying += 1;
    else if (result.kind === "cancelled") outcome.cancelled += 1;
  }
  return outcome;
}

/**
 * Dev/e2e-only inline drain for the assessment action: drains the queue and
 * maps the outcome to user copy. Production uses the opportunistic
 * single-job drain below (`after()`), not this; the action branches on
 * `shouldDrainAssessmentJobsInline` so the dev path stays synchronous.
 */
export async function drainAssessmentJobsInline(): Promise<string> {
  const outcome = await drainAssessmentJobQueue();
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
 * Opportunistic prod drain for `after()` continuations (manual action +
 * webhook route). Claims and runs a single job, then returns: each enqueue
 * schedules its own task, so one invocation never hogs the queue and
 * concurrent tasks for the same project serialize on the claim
 * (`FOR UPDATE SKIP LOCKED` + serial-per-project guard).
 *
 * Never throws — a killed task or a scan that exceeds the serverless budget
 * leaves the job `queued`/`running` and the daily Cron sweep retries it via
 * lease recovery.
 */
export async function drainSingleAssessmentJobOpportunistically(): Promise<void> {
  try {
    const [result] = await runAssessmentJobBatch({ limit: 1 });
    reportEvent("opportunistic assessment drain finished", {
      code: "assessment_opportunistic_drain_finished",
      kind: result?.kind ?? "idle",
      jobId:
        result && "jobId" in result ? (result.jobId as string) : undefined,
    });
  } catch (error) {
    reportWarning("opportunistic assessment drain failed", {
      code: "assessment_opportunistic_drain_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
