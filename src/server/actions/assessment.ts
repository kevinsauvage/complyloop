"use server";

import { after } from "next/server";
import { z } from "zod";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import type { ActionState } from "@/core/action-state";
import { entityIdSchema, parseForm } from "@/core/validate";

import { runAction } from "../action-state";
import {
  activeAssessmentJobForProject,
  type AssessmentJob,
  cancelAssessmentJob,
  enqueueAssessmentJob,
  recoverExpiredAssessmentLeases,
} from "../assessment/assessment-jobs";
import {
  scheduleAssessmentDrain,
  shouldDrainAssessmentJobsInline,
} from "../assessment/assessment-scheduler";
import { assertAssessRateLimit } from "../rate-limit";
import { appendEvidence } from "../workspace/project-rows";
import { withProjectWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, requireOnActive } from "./shared";

const cancelAssessmentJobInput = z.object({
  jobId: entityIdSchema,
});

/**
 * A `running` job whose lease already expired is a dead worker, not an
 * active scan — the heartbeat renews live leases every 5 minutes against a
 * 30-minute lease, so an expired lease means no worker is coming back.
 */
function hasLiveLease(job: AssessmentJob, now: number): boolean {
  if (job.status !== "running" || !job.leaseExpiresAt) return false;
  const expiresAt = Date.parse(job.leaseExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/**
 * A `queued` job past its `availableAt` is dispatchable right now (a
 * just-recovered lease lands here with `availableAt: now`). Kicking the
 * worker for it cannot duplicate work — the serial-per-project claim still
 * runs one assessment at a time. A job in backoff (`availableAt` in the
 * future) is left alone so a re-kick cannot boot a runner for nothing.
 */
function isDueForDispatch(job: AssessmentJob, now: number): boolean {
  if (job.status !== "queued") return false;
  const availableAt = Date.parse(job.availableAt);
  return Number.isFinite(availableAt) && availableAt <= now;
}

/**
 * Queues a manual assessment and kicks the worker without waiting for it.
 *
 * The click resolves in well under a second with "queued" copy while the
 * scan itself runs wherever the queue drains: inline in the same request on
 * the dev/e2e path (local Playwright, no function timeout), or on the
 * GitHub Actions executor on production via `after()` dispatch (its 15-min
 * schedule is the backstop for failed dispatches). The previous direct behavior — scanning inside this
 * action — timed out the dashboard function on Vercel (300s) and left
 * stranded `running` rows; the queue has lease recovery instead.
 *
 * The scan therefore runs *outside* the project write lock — holding
 * `project-write:{id}` for minutes would deadlock the apply that takes the
 * same lock. Progress is visible in the dashboard Pipeline section, which
 * polls `queued`/`running` jobs every 3s and refreshes on completion.
 *
 * Webhooks share this queued path: GitHub requires a 2xx in seconds, so
 * their scans cannot run inside the delivery request either.
 */
export async function runAssessmentAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  return runAction(async () => {
    // One short write (permission + rate limit + enqueue + evidence, all
    // under the project lock), then the drain happens outside it.
    const context: {
      projectId: string | null;
      job: AssessmentJob | null;
      alreadyActive: AssessmentJob | null;
    } = {
      projectId: null,
      job: null,
      alreadyActive: null,
    };
    await withProjectWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      context.projectId = workspace.project.id;
      if (workspace.userId) await assertAssessRateLimit(workspace.userId);
      // Reclaim crashed-worker leases before reading the active job: an
      // expired-`running` row must not block re-dispatch until the 15-minute
      // schedule happens to claim (recovery requeues while attempts remain,
      // terminal-fails poison jobs — either way the row below is current).
      await recoverExpiredAssessmentLeases();
      const active = await activeAssessmentJobForProject(workspace.project.id);
      if (active) {
        context.alreadyActive = active;
        return;
      }
      const job = await enqueueAssessmentJob({
        projectId: workspace.project.id,
        trigger: "manual",
        requestedByUserId: workspace.userId,
      });
      context.job = job;
      const payload: ProjectWritePayload = {};
      appendEvidence(payload, {
        kind: "assessment_job",
        summary: `Assessment job ${job.id} queued for "${workspace.project.name}"`,
        projectId: workspace.project.id,
        detail: { phase: "queued", jobId: job.id, trigger: "manual" },
      });
      return payload;
    });

    const alreadyActive = context.alreadyActive;
    if (alreadyActive) {
      refresh(...COMPLIANCE_LOOP_ROUTES);
      const now = Date.now();
      if (hasLiveLease(alreadyActive, now)) {
        return "An assessment is already running — track it in the Pipeline below.";
      }
      if (isDueForDispatch(alreadyActive, now)) {
        // Dispatchable but idle: the first kick failed or the lease was just
        // recovered above. Re-kick instead of returning silently — no second
        // job is enqueued, so scans cannot stack behind the serial claim.
        after(() => scheduleAssessmentDrain());
        return "An assessment is already queued — kicked the worker to pick it up. Track progress in the Pipeline below.";
      }
      const state = alreadyActive.status === "running" ? "running" : "queued";
      return `An assessment is already ${state} — track it in the Pipeline below.`;
    }

    const job = context.job;
    if (!job) throw new PublicError("Could not queue the assessment.");
    if (shouldDrainAssessmentJobsInline()) {
      // Dev/e2e: no function timeout and a local browser, so drain now and
      // report the real outcome like before.
      const message = await scheduleAssessmentDrain();
      refresh(...COMPLIANCE_LOOP_ROUTES);
      return message ?? "Assessment complete.";
    }
    // Production: kick the worker after responding. Never throws — a failed
    // dispatch leaves the job queued for the executor's 15-min schedule,
    // which reclaims it via lease recovery.
    after(() => scheduleAssessmentDrain());
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Assessment queued — the worker picks it up shortly. Track progress in the Pipeline below; you can leave this page.";
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
