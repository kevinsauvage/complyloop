import "server-only";

import type { Finding } from "@complyloop/analysis-core/contract/entities";

import { postAssessmentCheckRun } from "../github/github-connector";
import { reportError, reportEvent, reportWarning } from "../observability";
import { loadProjectDb } from "../workspace/db";
import { type AssessmentRunResult, runAssessment } from "./assessment";
import {
  ASSESSMENT_JOB_HEARTBEAT_MS,
  type AssessmentJob,
  claimNextAssessmentJob,
  completeAssessmentJob,
  failAssessmentJob,
  refreshAssessmentJobLease,
} from "./assessment-jobs";
import {
  applyAuthoritativeAssessment,
  recordAssessmentFailureEvidence,
  snapshotPipelineSlice,
  toPipelineInput,
} from "./assessment-pipeline";
import { withProjectCheckout } from "./repo-checkout";

function openViolationCount(findings: ReadonlyArray<Finding>): number {
  return findings.filter(
    (finding) => finding.status === "open" && finding.kind === "violation",
  ).length;
}

function failedRequirementCount(
  requirements: AssessmentRunResult["requirements"],
): number {
  return requirements.filter((requirement) => requirement.status === "failed")
    .length;
}

async function runClaimedAssessmentJob(
  job: AssessmentJob,
): Promise<{ cancelled: boolean }> {
  // Pipeline shape: load → run → apply. Status/finding derivation lives in
  // `runAssessment`; persistence (locks, alerts, evidence) lives in
  // `assessment-pipeline.ts`. This function only wires the two together plus
  // the ephemeral checkout and the PR Check Run post.
  const db = await loadProjectDb(job.projectId);
  const pipelineInput = toPipelineInput(db, job.projectId);
  const { project } = pipelineInput;
  const loadedSlice = snapshotPipelineSlice(pipelineInput);

  // Only the default branch (or an explicit manual assessment) is
  // authoritative for the project's compliance state. A webhook pull-request
  // scan assesses a proposed change: it posts a Check Run but must not
  // resolve findings, flip statuses, or auto-verify remediations.
  const authoritative = !job.payload.pullRequestHeadSha;

  // Lease heartbeat: long scans (large clone + Playwright) must never expire
  // mid-run and get double-executed by lease recovery. A heartbeat that finds
  // the job gone from `running` means a user cancelled it — flag it so the
  // caller skips complete/fail/evidence instead of resurrecting the job.
  let expectedLease = job.leaseExpiresAt;
  let cancelledRemotely = false;
  const heartbeat =
    expectedLease && job.startedAt
      ? setInterval(() => {
          void (async () => {
            try {
              const renewed = await refreshAssessmentJobLease({
                id: job.id,
                leaseExpiresAt: expectedLease as string,
                startedAt: job.startedAt as string,
              });
              if (renewed) {
                expectedLease = renewed;
              } else {
                cancelledRemotely = true;
                clearInterval(heartbeat ?? undefined);
              }
            } catch (error) {
              reportWarning("Assessment job heartbeat failed", {
                code: "assessment_job_heartbeat_failed",
                jobId: job.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
        }, ASSESSMENT_JOB_HEARTBEAT_MS)
      : null;
  // Never hold the process (or a test runner) open for the heartbeat alone.
  if (heartbeat && typeof heartbeat.unref === "function") heartbeat.unref();

  try {
    // Wall-clock attribution: clone/quota/cleanup (checkout) vs scan vs
    // apply, so production slowness lands on a stage instead of a guess.
    // checkoutMs is derived (total − scan − apply) to avoid hooks inside
    // the checkout helper; the in-scan split lives on the run's evidence.
    const checkoutStart = Date.now();
    let scanMs = 0;
    let applyMs = 0;
    const result = await withProjectCheckout(
      project,
      async (rootPath) => {
        const scanStart = Date.now();
        const run = await runAssessment(pipelineInput, {
          rootPath,
          authoritative,
        });
        scanMs = Date.now() - scanStart;
        const { assessment } = run;
        const trigger = job.payload.eventName ?? "manual assessment";

        // A cancel that lands mid-run discards the results: nothing is
        // persisted and no Check Run is posted, so "cancel" always means
        // "saves nothing".
        if (authoritative && !cancelledRemotely) {
          const applyStart = Date.now();
          await applyAuthoritativeAssessment({
            project,
            job,
            run,
            loadedSlice,
            collectAlerts: job.trigger === "webhook",
            trigger,
          });
          applyMs = Date.now() - applyStart;
        }

        return {
          project,
          assessment,
          openViolations: openViolationCount(run.findings),
          failedRequirements: failedRequirementCount(run.requirements),
        };
      },
      job.payload.ref,
    );
    const totalMs = Date.now() - checkoutStart;
    reportEvent("assessment stage timings", {
      code: "assessment_stage_timing",
      projectId: project.id,
      jobId: job.id,
      checkoutMs: Math.max(totalMs - scanMs - applyMs, 0),
      scanMs,
      applyMs,
      totalMs,
    });

    if (
      !cancelledRemotely &&
      job.trigger === "webhook" &&
      job.payload.pullRequestHeadSha
    ) {
      await postAssessmentCheckRun({
        project: result.project,
        jobId: job.id,
        headSha: job.payload.pullRequestHeadSha,
        openViolations: result.openViolations,
        failedRequirements: result.failedRequirements,
        assessmentId: result.assessment.id,
      });
    }
    return { cancelled: cancelledRemotely };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

export type AssessmentWorkerResult =
  | { kind: "idle" }
  | { kind: "succeeded"; jobId: string }
  | { kind: "retrying"; jobId: string }
  | { kind: "failed"; jobId: string }
  | { kind: "cancelled"; jobId: string };

export type RunningAssessmentJobResult = Exclude<
  AssessmentWorkerResult,
  { kind: "idle" }
>;

/**
 * Executes an already-`running` job to a terminal state: run the scan, then
 * complete, cancel, or fail it. Shared by the claim loop below and the direct
 * manual run (`actions/assessment.ts`), so a manual run and a worker run have
 * identical persistence, cancellation, and retry semantics.
 */
export async function settleRunningAssessmentJob(
  job: AssessmentJob,
): Promise<RunningAssessmentJobResult> {
  reportEvent("assessment job claimed", {
    code: "assessment_job_claimed",
    jobId: job.id,
    projectId: job.projectId,
    trigger: job.trigger,
    attempts: job.attempts,
  });
  try {
    const outcome = await runClaimedAssessmentJob(job);
    if (outcome.cancelled) {
      // The user cancelled mid-run: the heartbeat already saw the job leave
      // `running`. Skip complete/fail/evidence — the complete/fail lease
      // guards would no-op anyway, and a failure record must not follow a
      // deliberate cancel.
      reportEvent("assessment job cancelled", {
        code: "assessment_job_cancelled",
        jobId: job.id,
        projectId: job.projectId,
      });
      return { kind: "cancelled", jobId: job.id };
    }
    await completeAssessmentJob(job);
    reportEvent("assessment job completed", {
      code: "assessment_job_succeeded",
      jobId: job.id,
      projectId: job.projectId,
    });
    return { kind: "succeeded", jobId: job.id };
  } catch (error) {
    const status = await failAssessmentJob(job, error);
    if (status === "failed") {
      // Failure evidence serializes with concurrent applies via the project
      // write lock (see assessment-pipeline.ts). Bookkeeping never masks
      // the original job failure.
      await recordAssessmentFailureEvidence({
        projectId: job.projectId,
        job,
        error,
      });
    }
    reportError(error, {
      code:
        status === "failed"
          ? "assessment_job_failed"
          : "assessment_job_retrying",
      jobId: job.id,
      projectId: job.projectId,
      attempts: job.attempts,
    });
    return { kind: status === "failed" ? "failed" : "retrying", jobId: job.id };
  }
}

/** Claims and processes a single job; safe to run concurrently on many workers. */
export async function processNextAssessmentJob(): Promise<AssessmentWorkerResult> {
  const job = await claimNextAssessmentJob();
  if (!job) {
    return { kind: "idle" };
  }
  return settleRunningAssessmentJob(job);
}
