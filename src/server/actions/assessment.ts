"use server";

import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import {
  type ActionState,
  runAction,
} from "../action-state";
import {
  drainAssessmentJobQueue,
  shouldDrainAssessmentJobsInline,
} from "../assessment/assessment-job-inline";
import { type AssessmentJob,enqueueAssessmentJob } from "../assessment/assessment-jobs";
import { assertAssessRateLimit } from "../rate-limit";
import { appendEvidence } from "../workspace/project-rows";
import { withProjectWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, requireOnActive } from "./shared";

export async function runAssessmentAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return runAction(async () => {
    // One workspace load for the whole action: enqueue + evidence in the same
    // project write (rate limit + permission checks included).
    let job: AssessmentJob;
    await withProjectWrite(async (workspace) => {
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
      refresh(...COMPLIANCE_LOOP_ROUTES);
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

    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Assessment queued. Results will appear when the worker completes it.";
  });
}
