"use server";

import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { entityIdSchema, parseForm } from "@/core/validate";

import { type ActionState, runAction } from "../action-state";
import {
  type AssessmentJob,
  cancelAssessmentJob,
  startAssessmentJob,
} from "../assessment/assessment-jobs";
import {
  type RunningAssessmentJobResult,
  settleRunningAssessmentJob,
} from "../assessment/assessment-worker";
import { reportEvent } from "../observability";
import { assertAssessRateLimit } from "../rate-limit";
import { appendEvidence } from "../workspace/project-rows";
import { withProjectWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, requireOnActive } from "./shared";

const cancelAssessmentJobInput = z.object({
  jobId: entityIdSchema,
});

/** Toast copy for a finished direct run; never claims more than the result. */
function runOutcomeMessage(
  outcome: RunningAssessmentJobResult,
  job: AssessmentJob,
): string {
  switch (outcome.kind) {
    case "succeeded":
      return "Assessment complete.";
    case "cancelled":
      return "Assessment cancelled.";
    case "retrying":
      return "Assessment hit an error and will retry automatically.";
    case "failed":
      return `${job.attempts >= job.maxAttempts ? "Assessment" : "The previous assessment"} failed. Check the server logs for details.`;
    default: {
      const _exhaustive: never = outcome;
      throw new Error(`Unhandled assessment outcome: ${_exhaustive}`);
    }
  }
}

/**
 * Runs an assessment **directly**: the user's click scans the repository and
 * resolves with the result, so the button loader, the toast, and the refreshed
 * results all belong to one request. There is no queue hop for manual runs —
 * progress was invisible behind a queued job and a polling UI.
 *
 * The job row is still written (status `running`, lease + `attempts: 1`)
 * before the scan and settled after it, for two reasons: a killed request
 * leaves a recoverable row that the scheduled sweep requeues, and the job
 * history stays one model for manual and webhook runs. The scan therefore
 * runs *outside* the project write lock — holding `project-write:{id}` for
 * minutes would deadlock the apply that takes the same lock.
 *
 * Webhooks keep the queued worker path: GitHub requires a 2xx in seconds, so
 * their scans cannot run inside the delivery request.
 */
export async function runAssessmentAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return runAction(async () => {
    // Start the job in one short write (permission + rate limit + evidence,
    // all under the project lock), then scan outside it.
    const context: { projectId: string | null; job: AssessmentJob | null } = {
      projectId: null,
      job: null,
    };
    await withProjectWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      context.projectId = workspace.project.id;
      if (workspace.userId) await assertAssessRateLimit(workspace.userId);
      const job = await startAssessmentJob({
        projectId: workspace.project.id,
        trigger: "manual",
        requestedByUserId: workspace.userId,
      });
      context.job = job;
      const payload: ProjectWritePayload = {};
      appendEvidence(payload, {
        kind: "assessment_job",
        summary: `Assessment job ${job.id} started for "${workspace.project.name}"`,
        projectId: workspace.project.id,
        detail: { phase: "started", jobId: job.id, trigger: "manual" },
      });
      return payload;
    });

    const job = context.job;
    if (!job) throw new PublicError("Could not start the assessment.");
    const outcome = await settleRunningAssessmentJob(job);
    reportEvent("assessment job run directly", {
      code: "assessment_run_direct",
      projectId: context.projectId,
      jobId: job.id,
      trigger: "manual",
      outcome: outcome.kind,
    });
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return runOutcomeMessage(outcome, job);
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
