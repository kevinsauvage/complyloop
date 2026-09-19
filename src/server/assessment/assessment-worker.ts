import "server-only";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Severity } from "@complyloop/analysis-core/contract/statuses";

import type { AssessmentJobStage } from "@/core/assessment/assessment-jobs";

import {
  postAssessmentCheckRun,
  postAssessmentFailureCheckRun,
  postInProgressCheckRunForPreview,
} from "../github/github-connector";
import { reportError, reportEvent, reportWarning } from "../observability";
import { loadProjectDb } from "../workspace/db";
import { type AssessmentRunResult, runAssessment } from "./assessment";
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

function openViolationCount(findings: ReadonlyArray<Finding>): number {
  return findings.filter(
    (finding) => finding.status === "open" && finding.kind === "violation",
  ).length;
}

/**
 * Explicit scan authority: only a manual assessment or a webhook push of the
 * default branch may derive the persistent compliance state. Anything else —
 * PR previews, unknown events, malformed payloads that slipped past the
 * claim gate — is preview-only and must not resolve findings, flip statuses,
 * or auto-verify remediations. Fail closed, never `!pullRequestHeadSha`.
 */
export function resolveJobAuthoritative(job: AssessmentJob): boolean {
  if (job.trigger === "manual") return true;
  if (job.trigger !== "webhook") return false;
  return (
    job.payload.eventName === "push" && job.payload.pullRequestHeadSha == null
  );
}

function failedRequirementCount(
  requirements: AssessmentRunResult["requirements"],
): number {
  return requirements.filter((requirement) => requirement.status === "failed")
    .length;
}

function severityBreakdown(
  findings: ReadonlyArray<Finding>,
): Partial<Record<Severity, number>> {
  const breakdown: Partial<Record<Severity, number>> = {};
  for (const finding of findings) {
    if (finding.status !== "open" || finding.kind !== "violation") continue;
    const level: Severity = finding.severity;
    breakdown[level] = (breakdown[level] ?? 0) + 1;
  }
  return breakdown;
}

function isPreviewJob(job: AssessmentJob): string | null {
  if (job.trigger !== "webhook") return null;
  const sha = job.payload.pullRequestHeadSha;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

async function runClaimedAssessmentJob(
  job: AssessmentJob,
  onLeaseRenewed?: (leaseExpiresAt: string) => void,
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
  const authoritative = resolveJobAuthoritative(job);
  const previewHeadSha = isPreviewJob(job);

  // Claim-time progress signal: queued was posted on enqueue, so move the
  // Check to in_progress now. Warn-never-throw — a GitHub outage must not
  // fail the assessment.
  if (previewHeadSha) {
    await postInProgressCheckRunForPreview({
      project,
      jobId: job.id,
      headSha: previewHeadSha,
      startedAt: job.startedAt,
    });
  }

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
        const { assessment } = run;
        const trigger = job.payload.eventName ?? "manual assessment";

        // A cancel that lands mid-run discards the results: nothing is
        // persisted and no Check Run is posted, so "cancel" always means
        // "saves nothing".
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
            // so the contract above still holds. Stop without Check Run output.
            applyCancelled = true;
            return null;
          } finally {
            applyMs = Date.now() - applyStart;
          }
        }

        return {
          project,
          assessment,
          openViolations: openViolationCount(run.findings),
          failedRequirements: failedRequirementCount(run.requirements),
          severity: severityBreakdown(run.findings),
        };
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
        severity: result.severity,
        startedAt: job.startedAt,
        completedAt: new Date().toISOString(),
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
 * complete, cancel, or fail it. Shared by the claim loop below, so worker
 * runs have identical persistence, cancellation, and retry semantics no
 * matter which trigger enqueued the job.
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
    // A PR preview whose scan crashes terminally must still signal the PR —
    // otherwise it waits on "expected checks" forever. Retries stay quiet
    // (the verdict or a later terminal failure posts instead). Never masks
    // the original failure.
    if (
      status === "failed" &&
      effectiveJob.trigger === "webhook" &&
      effectiveJob.payload.pullRequestHeadSha
    ) {
      await postFailureCheckRunForJob(
        effectiveJob,
        effectiveJob.payload.pullRequestHeadSha,
        error,
      );
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

/**
 * Best-effort failure Check Run for a terminally crashed PR preview scan.
 * Loads the project fresh (the run itself never produced one) and never
 * throws — a missing check signal must not mask the recorded job failure.
 */
async function postFailureCheckRunForJob(
  job: AssessmentJob,
  headSha: string,
  error: unknown,
): Promise<void> {
  try {
    const db = await loadProjectDb(job.projectId);
    const project = db.projects.find(
      (candidate) => candidate.id === job.projectId,
    );
    if (!project) return;
    await postAssessmentFailureCheckRun({
      project,
      jobId: job.id,
      headSha,
      error,
    });
  } catch (postError) {
    reportWarning("Pull-request failure Check Run could not be posted.", {
      code: "github_check_run_failed",
      projectId: job.projectId,
      jobId: job.id,
      error: postError instanceof Error ? postError.message : String(postError),
    });
  }
}

/** Claims and processes a single job; safe to run concurrently on many workers. */ export async function processNextAssessmentJob(): Promise<AssessmentWorkerResult> {
  const job = await claimNextAssessmentJob();
  if (!job) {
    return { kind: "idle" };
  }
  return settleRunningAssessmentJob(job);
}
