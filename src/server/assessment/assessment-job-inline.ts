import "server-only";

import { isE2EHarnessEnabled } from "../e2e-harness";
import { dispatchAssessmentWorker } from "./assessment-job-dispatch";

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
 * Claims and runs ready jobs until the queue is idle or `maxJobs` is reached.
 *
 * The runner is dynamically imported so trigger sites (which only import
 * `scheduleAssessmentDrain` below) never statically reach the scan stack —
 * only `/api/internal/jobs/run` and the dev/e2e inline path execute it.
 */
export async function drainAssessmentJobQueue(
  maxJobs = 20,
): Promise<DrainAssessmentJobsResult> {
  const { runAssessmentJobBatch } = await import("./assessment-runner");
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
 * Dev/e2e-only inline drain for `scheduleAssessmentDrain`: drains the queue
 * and maps the outcome to user copy. Production self-fetches the worker
 * route instead; the caller branches on `shouldDrainAssessmentJobsInline`
 * (inside the scheduler) so the dev path stays synchronous.
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
 * Never throws — a failed dispatch leaves the job `queued`/`running` and the
 * scheduled worker reclaims it via lease recovery.
 */
export async function scheduleAssessmentDrain(): Promise<string | undefined> {
  if (shouldDrainAssessmentJobsInline()) {
    return drainAssessmentJobsInline();
  }
  await dispatchAssessmentWorker();
  return undefined;
}
