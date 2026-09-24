import "server-only";

import type { AssessmentJobStage } from "@/core/assessment/assessment-jobs";

import { reportError, reportEvent, reportWarning } from "../observability";
import { loadProjectDb } from "../workspace/db";
import { runAssessment } from "./assessment";
import {
  ASSESSMENT_JOB_HEARTBEAT_MS,
  type AssessmentJob,
  AssessmentJobCancelledError,
  claimNextAssessmentJob,
  completeAssessmentJob,
  failAssessmentJob,
  refreshAssessmentJobLease,
  updateAssessmentJobStage,
} from "./assessment-jobs";
import {
  applyAuthoritativeAssessment,
  recordAssessmentFailureEvidence,
  snapshotPipelineSlice,
  toPipelineInput,
} from "./assessment-pipeline";
import { withProjectCheckout } from "./repo-checkout";

/**
 * Explicit scan authority: only a manual assessment or a webhook push of the
 * default branch may derive the persistent compliance state. Anything else —
 * unknown events or malformed payloads that slipped past the claim gate — is
 * non-authoritative and must not resolve findings, flip statuses, or
 * auto-verify remediations. Fail closed.
 */
export function resolveJobAuthoritative(job: AssessmentJob): boolean {
  if (job.trigger === "manual") return true;
  if (job.trigger !== "webhook") return false;
  return job.payload.eventName === "push";
}

async function runClaimedAssessmentJob(
  job: AssessmentJob,
  onLeaseRenewed?: (leaseExpiresAt: string) => void,
): Promise<{ cancelled: boolean }> {
  // Pipeline shape: load → run → apply. Status/finding derivation lives in
  // `runAssessment`; persistence (locks, alerts, evidence) lives in
  // `assessment-pipeline.ts`. This function only wires the two together plus
  // the ephemeral checkout.
  const db = await loadProjectDb(job.projectId);
  const pipelineInput = toPipelineInput(db, job.projectId);
  const { project } = pipelineInput;
  const loadedSlice = snapshotPipelineSlice(pipelineInput);

  // Only the default branch (or an explicit manual assessment) is
  // authoritative for the project's compliance state. Anything else runs the
  // same analysis but persists nothing and never resolves findings, flips
  // statuses, or auto-verifies remediations.
  const authoritative = resolveJobAuthoritative(job);

  // Lease heartbeat: long scans (large clone + Playwright) must never expire
  // mid-run and get double-executed by lease recovery. A heartbeat that finds
  // the job gone from `running` means a user cancelled it — flag it so the
  // caller skips complete/fail/evidence instead of resurrecting the job.
  let expectedLease = job.leaseExpiresAt;
  let cancelledRemotely = false;
  let renewInFlight = false;
  const heartbeat =
    expectedLease && job.startedAt
      ? setInterval(() => {
          // Skip a tick while a renew is still in flight: overlapping renews
          // carry a stale `expectedLease`, which the exact-match guard reads as
          // a remote cancel — discarding a healthy long run.
          if (renewInFlight) return;
          renewInFlight = true;
          void (async () => {
            try {
              const renewed = await refreshAssessmentJobLease({
                id: job.id,
                leaseExpiresAt: expectedLease as string,
                startedAt: job.startedAt as string,
              });
              if (renewed) {
                expectedLease = renewed;
                onLeaseRenewed?.(renewed);
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
            } finally {
              renewInFlight = false;
            }
          })();
        }, ASSESSMENT_JOB_HEARTBEAT_MS)
      : null;
  // Never hold the process (or a test runner) open for the heartbeat alone.
  if (heartbeat && typeof heartbeat.unref === "function") heartbeat.unref();

  try {
    // Wall-clock attribution: clone/quota/fetch (checkout) vs scan vs apply,
    // so production slowness lands on a stage instead of a guess. checkoutMs
    // is measured at the checkout-callback boundary (no hooks inside the
    // checkout helper); the in-scan split lives on the run's evidence.
    // Each boundary also stamps the job payload stage (best effort) so the
    // Pipeline UI and crash forensics can see what the run was doing.
    const reportStage = (stage: AssessmentJobStage): void => {
      void updateAssessmentJobStage(job.id, stage);
    };
    const checkoutStart = Date.now();
    let checkoutMs = 0;
    let scanMs = 0;
    let applyMs = 0;
    let applyCancelled = false;
    reportStage("checkout");
    const result = await withProjectCheckout(
      project,
      async (rootPath) => {
        checkoutMs = Date.now() - checkoutStart;
        const scanStart = Date.now();
        const run = await runAssessment(pipelineInput, {
          rootPath,
          authoritative,
          onStage: reportStage,
        });
        scanMs = Date.now() - scanStart;
        const trigger = job.payload.eventName ?? "manual assessment";

        // A cancel that lands mid-run discards the results: nothing is
        // persisted, so "cancel" always means "saves nothing".
        if (authoritative && !cancelledRemotely) {
          const applyStart = Date.now();
          reportStage("apply");
          try {
            await applyAuthoritativeAssessment({
              project,
              job,
              run,
              loadedSlice,
              collectAlerts: job.trigger === "webhook",
              trigger,
            });
          } catch (error) {
            if (!(error instanceof AssessmentJobCancelledError)) throw error;
            // The cancel landed mid-apply: the apply transaction rolled back,
            // so the contract above still holds.
            applyCancelled = true;
            return null;
          } finally {
            applyMs = Date.now() - applyStart;
          }
        }

        return true as const;
      },
      job.payload.ref,
    );
    if (result === null || applyCancelled) {
      return { cancelled: true };
    }
    const totalMs = Date.now() - checkoutStart;
    reportEvent("assessment stage timings", {
      code: "assessment_stage_timing",
      projectId: project.id,
      jobId: job.id,
      checkoutMs,
      scanMs,
      applyMs,
      totalMs,
    });

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
 * Executes a claimed `verify_remediation` job: re-audit one finding's
 * implemented remediation on the worker and apply the verdict. Much shorter
 * than an assessment (no checkout, no full pipeline), and its single browser
 * re-audit is far below the lease, so it needs no heartbeat. The handler is
 * reached through dynamic `import()` so the scan stack never enters this
 * module's static graph.
 */
async function settleRunningVerifyJob(
  job: AssessmentJob,
): Promise<RunningAssessmentJobResult> {
  const findingId = job.payload.findingId;
  reportEvent("remediation verify job claimed", {
    code: "remediation_verify_job_claimed",
    jobId: job.id,
    projectId: job.projectId,
    findingId,
    attempts: job.attempts,
  });
  if (!findingId) {
    await failAssessmentJob(job, new Error("Verify job missing findingId."));
    return { kind: "failed", jobId: job.id };
  }
  try {
    const { runRemediationVerifyJob } =
      await import("./remediation-verify-worker");
    await runRemediationVerifyJob(findingId);
    await completeAssessmentJob(job);
    reportEvent("remediation verify job completed", {
      code: "remediation_verify_job_succeeded",
      jobId: job.id,
      projectId: job.projectId,
      findingId,
    });
    return { kind: "succeeded", jobId: job.id };
  } catch (error) {
    const status = await failAssessmentJob(job, error);
    reportError(error, {
      code:
        status === "failed"
          ? "remediation_verify_job_failed"
          : "remediation_verify_job_retrying",
      jobId: job.id,
      projectId: job.projectId,
      findingId,
      attempts: job.attempts,
    });
    return { kind: status === "failed" ? "failed" : "retrying", jobId: job.id };
  }
}

/**
 * Executes an already-`running` job to a terminal state: run the scan, then
 * complete, cancel, or fail it. Shared by the claim loop below, so worker
 * runs have identical persistence, cancellation, and retry semantics no
 * matter which trigger enqueued the job.
 */
export async function settleRunningAssessmentJob(
  job: AssessmentJob,
): Promise<RunningAssessmentJobResult> {
  if (job.trigger === "verify_remediation") {
    return settleRunningVerifyJob(job);
  }
  reportEvent("assessment job claimed", {
    code: "assessment_job_claimed",
    jobId: job.id,
    projectId: job.projectId,
    trigger: job.trigger,
    attempts: job.attempts,
  });
  // The completion/failure guards below match on the claim-time
  // (startedAt, leaseExpiresAt) pair, so they must see the *current* lease:
  // every heartbeat renewal reports through `onLeaseRenewed` and settle
  // completes/fails with that value. Completing with the stale claim-time
  // lease would no-op on any scan longer than one heartbeat interval and
  // the job would be re-run by lease recovery.
  let effectiveJob = job;
  try {
    const outcome = await runClaimedAssessmentJob(job, (leaseExpiresAt) => {
      effectiveJob = { ...job, leaseExpiresAt };
    });
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
    await completeAssessmentJob(effectiveJob);
    reportEvent("assessment job completed", {
      code: "assessment_job_succeeded",
      jobId: job.id,
      projectId: job.projectId,
    });
    return { kind: "succeeded", jobId: job.id };
  } catch (error) {
    const status = await failAssessmentJob(effectiveJob, error);
    // Failure evidence serializes with concurrent applies via the project
    // write lock (see assessment-pipeline.ts). Bookkeeping never masks
    // the original job failure.
    await recordAssessmentFailureEvidence({
      projectId: effectiveJob.projectId,
      job: effectiveJob,
      error,
      phase: status === "failed" ? "failed" : "retrying",
    });
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

/** Claims and processes a single job; safe to run concurrently on many workers. */ export async function processNextAssessmentJob(): Promise<AssessmentWorkerResult> {
  const job = await claimNextAssessmentJob();
  if (!job) {
    return { kind: "idle" };
  }
  return settleRunningAssessmentJob(job);
}

/**
 * Long-lived executor teardown (GitHub Actions drain script): close the
 * cached browser and the DB pool so the process can exit after the batch
 * summary prints. Serverless invocations never call this — the container
 * dies with the request, and this module is never statically reached from a
 * Vercel route. Best-effort and never throws; the caller still exits with
 * its own code.
 */
export async function closeAssessmentWorker(): Promise<void> {
  try {
    const { closeRuntimeBrowser } =
      await import("@complyloop/analysis-core/runtime/scan");
    await closeRuntimeBrowser();
  } catch (error) {
    reportWarning("Assessment worker browser close failed.", {
      code: "assessment_worker_teardown_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const { closeDrizzle } = await import("@complyloop/db/postgres");
    await closeDrizzle();
  } catch (error) {
    reportWarning("Assessment worker DB close failed.", {
      code: "assessment_worker_teardown_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
