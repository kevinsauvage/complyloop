import "server-only";

import type { Finding } from "@complyloop/analysis-core/contract/entities";

import { resolveProjectGitHubToken } from "../github/github-access";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "../github/github-checks";
import { reportError, reportInfo, reportWarning } from "../observability";
import { loadProjectDb } from "../workspace/db";
import { type AssessmentRunResult, runAssessment } from "./assessment";
import {
  type AssessmentJob,
  claimNextAssessmentJob,
  completeAssessmentJob,
  failAssessmentJob,
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

async function runClaimedAssessmentJob(job: AssessmentJob): Promise<void> {
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

  const result = await withProjectCheckout(
    project,
    async (rootPath) => {
      const run = await runAssessment(pipelineInput, {
        rootPath,
        authoritative,
      });
      const { assessment } = run;
      const trigger = job.payload.eventName ?? "manual assessment";

      if (authoritative) {
        await applyAuthoritativeAssessment({
          project,
          job,
          run,
          loadedSlice,
          collectAlerts: job.trigger === "webhook",
          trigger,
        });
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

  if (job.trigger !== "webhook" || !job.payload.pullRequestHeadSha) return;
  const token = await resolveProjectGitHubToken(result.project);
  if (!token || !result.project.github?.fullName) {
    reportWarning(
      "Could not post pull-request check: GitHub token unavailable.",
      {
        code: "github_token_missing",
        projectId: result.project.id,
        jobId: job.id,
      },
    );
    return;
  }
  const posted = await postPullRequestCheckRun({
    fullName: result.project.github.fullName,
    headSha: job.payload.pullRequestHeadSha,
    token,
    ...summarizeAssessmentForCheckRun({
      openViolations: result.openViolations,
      failedRequirements: result.failedRequirements,
      assessmentId: result.assessment.id,
    }),
  });
  if (!posted.ok) {
    reportWarning("Pull-request Check Run could not be posted.", {
      code: "github_check_run_failed",
      projectId: result.project.id,
      jobId: job.id,
      error: posted.error,
    });
  }
}

export type AssessmentWorkerResult =
  | { kind: "idle" }
  | { kind: "succeeded"; jobId: string }
  | { kind: "retrying"; jobId: string }
  | { kind: "failed"; jobId: string };

/** Claims and processes a single job; safe to run concurrently on many workers. */
export async function processNextAssessmentJob(): Promise<AssessmentWorkerResult> {
  const job = await claimNextAssessmentJob();
  if (!job) {
    // Rate-limit pruning runs on a wall-clock cadence in the worker loop
    // (`scripts/run-assessment-worker.ts`) rather than on every idle poll, so
    // an idle worker no longer writes to Postgres every few seconds.
    return { kind: "idle" };
  }
  reportInfo("assessment job claimed", {
    code: "assessment_job_claimed",
    jobId: job.id,
    projectId: job.projectId,
    trigger: job.trigger,
    attempts: job.attempts,
  });
  try {
    await runClaimedAssessmentJob(job);
    await completeAssessmentJob(job);
    reportInfo("assessment job completed", {
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
