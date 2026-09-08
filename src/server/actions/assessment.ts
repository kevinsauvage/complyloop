"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import {
  drainAssessmentJobQueue,
  shouldDrainAssessmentJobsInline,
} from "../assessment-job-inline";
import { enqueueAssessmentJob, type AssessmentJob } from "../assessment-jobs";
import { assertAssessRateLimit } from "../rate-limit";
import { withProjectWrite } from "../workspace-write";
import { appendEvidence } from "../project-rows";
import { refresh, requireOnActive } from "./shared";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

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
      const outcome = await drainAssessmentJobQueue();
      refresh();
      if (outcome.failed > 0) {
        return `${outcome.failed} assessment job${outcome.failed === 1 ? "" : "s"} failed. Check the server logs for details.`;
      }
      if (outcome.retrying > 0) {
        return "Assessment hit an error and will retry automatically.";
      }
      if (outcome.ran > 0) {
        return "Assessment complete.";
      }
      return "Assessment complete.";
    }

    refresh();
    return "Assessment queued. Results will appear when the worker completes it.";
  });
}
