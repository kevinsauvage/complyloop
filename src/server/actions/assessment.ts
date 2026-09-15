"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { entityIdSchema, parseForm } from "@/core/validate";

import { type ActionState, runAction } from "../action-state";
import {
  drainAssessmentJobsInline,
  shouldDrainAssessmentJobsInline,
} from "../assessment/assessment-job-inline";
import {
  type AssessmentJob,
  cancelAssessmentJob,
  enqueueAssessmentJob,
  findActiveAssessmentJob,
} from "../assessment/assessment-jobs";
import { assertAssessRateLimit } from "../rate-limit";
import { appendEvidence } from "../workspace/project-rows";
import { withProjectWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, requireOnActive } from "./shared";

const cancelAssessmentJobInput = z.object({
  jobId: entityIdSchema,
});

export async function runAssessmentAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return runAction(async () => {
    // One workspace load for the whole action: dedup check + enqueue +
    // evidence in the same project write (rate limit + permission checks
    // included). The per-project advisory lock serializes concurrent clicks,
    // so the check-then-enqueue below cannot stack duplicate jobs.
    let job: AssessmentJob | null = null;
    await withProjectWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const active = await findActiveAssessmentJob(workspace.project.id);
      if (active) return;
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

    if (!job) {
      refresh(...COMPLIANCE_LOOP_ROUTES);
      return "An assessment is already queued or running — cancel it below to start over.";
    }

    // Local `next dev` and the Playwright harness run without a dedicated
    // worker: drain inline so the action resolves with the result. Production
    // only enqueues (the worker owns the queue).
    const message = shouldDrainAssessmentJobsInline()
      ? await drainAssessmentJobsInline()
      : "Assessment queued. Results will appear when the worker completes it.";
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return message;
  });
}

/**
 * Cancels a `queued`/`running` assessment job for the active project. A
 * running scan stops at the next lease heartbeat and saves nothing; terminal
 * jobs (or another project's jobs) cannot be touched.
 */
export async function cancelAssessmentJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { jobId } = parseForm(
      cancelAssessmentJobInput,
      formData,
      "Invalid assessment job.",
    );
    await withProjectWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const cancelled = await cancelAssessmentJob({
        projectId: workspace.project.id,
        jobId,
      });
      if (!cancelled) {
        throw new PublicError("That assessment job already finished.");
      }
      const payload: ProjectWritePayload = {};
      appendEvidence(payload, {
        kind: "assessment_job",
        summary: `Assessment job ${cancelled.id} cancelled for "${workspace.project.name}"`,
        projectId: workspace.project.id,
        detail: {
          phase: "cancelled",
          jobId: cancelled.id,
          trigger: cancelled.trigger,
        },
      });
      return payload;
    });
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Assessment cancelled.";
  });
}
