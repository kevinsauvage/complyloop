"use server";

import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { drainAssessmentJobQueue, shouldDrainAssessmentJobsInline } from "../assessment-job-drain";
import { enqueueAssessmentJob } from "../assessment-jobs";
import { addEvidence } from "../db";
import { assertAssessRateLimit } from "../rate-limit";
import { getWorkspace, withProjectWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export async function runAssessmentAction(
  _previous: ActionMessageState,
  _formData: FormData,
): Promise<ActionMessageState> {
  void _formData;
  return runActionMessage(async () => {
    const preview = await getWorkspace();
    requireOnActive(preview, "project.assess");
    if (preview.userId) await assertAssessRateLimit(preview.userId);
    const job = await enqueueAssessmentJob({
      projectId: preview.project.id,
      trigger: "manual",
      requestedByUserId: preview.userId,
    });
    await withProjectWrite((workspace) => {
      requireOnActive(workspace, "project.assess");
      addEvidence(workspace.db, {
        kind: "assessment_job_queued",
        summary: `Assessment job ${job.id} queued for "${workspace.project.name}"`,
        projectId: workspace.project.id,
        detail: { jobId: job.id, trigger: "manual" },
      });
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
