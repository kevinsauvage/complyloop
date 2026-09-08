"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { processNextAssessmentJob } from "../assessment-worker";
import { enqueueAssessmentJob, type AssessmentJob } from "../assessment-jobs";
import { isE2EHarnessEnabled } from "../e2e-harness";
import { assertAssessRateLimit } from "../rate-limit";
import { withProjectWrite } from "../workspace-write";
import { appendEvidence } from "../project-rows";
import { refresh, requireOnActive } from "./shared";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

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

export async function runAssessmentAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    // One workspace load for the whole action: enqueue + evidence in the same
    // project write (rate limit + permission checks included).
    let job: AssessmentJob;
    await withProjectWrite({ touch: "project" }, async (workspace) => {
      requireOnActive(workspace, "project.assess");
      if (workspace.userId) await assertAssessRateLimit(workspace.userId);
      job = await enqueueAssessmentJob({
        projectId: workspace.project.id,
        trigger: "manual",
        requestedByUserId: workspace.userId,
      });
      const payload: ProjectWritePayload = {};
      appendEvidence(payload, {
        kind: "assessment_job",
        summary: `Assessment job ${job.id} queued for "${workspace.project.name}"`,
        projectId: workspace.project.id,
        detail: { phase: "queued", jobId: job.id, trigger: "manual" },
      });
      return payload;
    });

    if (shouldDrainAssessmentJobsInline()) {
      await drainAssessmentJobQueue();
      refresh();
      return "Assessment complete.";
    }

    refresh();
    return "Assessment queued. Results will appear when the worker completes it.";
  });
}
