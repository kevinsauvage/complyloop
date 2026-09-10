import "server-only";

import type {
  Alert,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import {
  acquireNamedPostgresAdvisoryLock,
  getDrizzle,
  projectWriteLockKey,
} from "@complyloop/db/postgres";
import { listAlertsForProject } from "@complyloop/db/repo/alerts";
import {
  applyAssessmentPayload,
  snapshotProjectSlice,
} from "@complyloop/db/repo/apply";
import { insertEvidence } from "@complyloop/db/repo/evidence";

import { type AssessmentRunResult,runAssessment } from "./assessment";
import {
  type AssessmentJob,
  claimNextAssessmentJob,
  completeAssessmentJob,
  failAssessmentJob,
} from "./assessment-jobs";
import { loadProjectDb } from "./db";
import { resolveProjectGitHubToken } from "./github-access";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "./github-checks";
import { reportError, reportInfo, reportWarning } from "./observability";
import { withProjectCheckout } from "./repo-checkout";

function collectRegressionAlerts(input: {
  alerts: ReadonlyArray<Alert>;
  run: AssessmentRunResult;
  projectId: string;
  trigger: string;
}): Alert[] {
  const { alerts: projectAlerts, run, projectId, trigger } = input;
  const assessment = run.assessment;
  const primaryChange = assessment.changesSincePrevious?.[0];

  return run.evidence
    .filter(
      (record) =>
        record.assessmentId === assessment.id &&
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    )
    .map((record) => {
      const openFinding = record.controlId
        ? run.findings.find(
            (finding) =>
              finding.controlId === record.controlId &&
              finding.status === "open",
          )
        : undefined;
      // Latest-wins per control: an unread regression alert for the same
      // control is refreshed in place (alerts upsert by id) instead of
      // minting a new row on every webhook push. Once read, a recurrence
      // mints a fresh alert.
      const existingUnread = record.controlId
        ? projectAlerts.find(
            (alert) =>
              alert.projectId === projectId &&
              alert.kind === "compliance_regression" &&
              !alert.read &&
              alert.detail?.controlId === record.controlId,
          )
        : undefined;

      return {
        id: existingUnread?.id ?? crypto.randomUUID(),
        projectId,
        kind: "compliance_regression" as const,
        summary: `${record.summary} (triggered by ${trigger})`,
        at: new Date().toISOString(),
        read: false,
        assessmentId: assessment.id,
        detail: {
          ...record.detail,
          trigger,
          controlId: record.controlId,
          findingId: openFinding?.id,
          commitSha: assessment.snapshot?.gitHead,
          changeFilePath: primaryChange?.filePath,
        },
      };
    });
}

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
  // One load for the whole job: the checkout touches the filesystem, not the
  // DB, so the slice stays fresh. The FK cascade on project deletion still
  // fails the apply transaction loudly if the project disappears mid-run.
  const db = await loadProjectDb(job.projectId);
  const project = db.projects.find(
    (candidate) => candidate.id === job.projectId,
  );
  if (!project)
    throw new Error("Project was removed before its assessment job ran.");
  const loadedSlice = snapshotProjectSlice(
    db.requirements,
    db.findings,
    db.remediations,
    db.alerts,
    project.id,
  );

  // Only the default branch (or an explicit manual assessment) is
  // authoritative for the project's compliance state. A webhook pull-request
  // scan assesses a proposed change: it posts a Check Run but must not
  // resolve findings, flip statuses, or auto-verify remediations.
  const authoritative = !job.payload.pullRequestHeadSha;

  const result = await withProjectCheckout(
    project,
    async (rootPath) => {
      const run = await runAssessment(db, project.id, {
        rootPath,
        authoritative,
      });
      const { assessment } = run;
      const trigger = job.payload.eventName ?? "manual assessment";

      const snapshot = assessment.snapshot;
      if (!snapshot) {
        throw new Error("Assessment completed without a snapshot.");
      }

      if (authoritative) {
        const drizzle = await getDrizzle();
        await drizzle.transaction(async (tx) => {
          await acquireNamedPostgresAdvisoryLock(
            tx,
            projectWriteLockKey(project.id),
          );
          // Read alerts inside the apply transaction (under the project write
          // lock): the pre-scan slice above may be minutes stale, and matching
          // against it could refresh an alert the user just read or mint
          // duplicates of one just created.
          const alerts =
            job.trigger === "webhook"
              ? collectRegressionAlerts({
                  alerts: await listAlertsForProject(tx, project.id),
                  run,
                  projectId: project.id,
                  trigger,
                })
              : [];
          await applyAssessmentPayload(
            tx,
            {
              assessment,
              snapshot,
              evidence: run.evidence,
              findings: run.findings,
              remediations: run.remediations,
              requirements: run.requirements,
              alerts,
            },
            { loadedSlice },
          );
          await insertEvidence(tx, {
            kind: "assessment_job",
            summary: `Assessment job ${job.id} completed for "${project.name}"`,
            projectId: project.id,
            assessmentId: assessment.id,
            detail: {
              phase: "completed",
              jobId: job.id,
              trigger: job.trigger,
              alerts: alerts.length,
              leaseExpiresAt: job.leaseExpiresAt,
            },
          });
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
      // Record failure evidence under the project write lock so it serializes
      // with concurrent assessment applies. Never let evidence bookkeeping
      // mask the original job failure.
      try {
        const db = await loadProjectDb(job.projectId);
        const project = db.projects.find(
          (candidate) => candidate.id === job.projectId,
        );
        if (project) {
          const errorMessage =
            error instanceof Error ? error.message : "Assessment job failed.";
          const drizzle = await getDrizzle();
          await drizzle.transaction(async (tx) => {
            await acquireNamedPostgresAdvisoryLock(
              tx,
              projectWriteLockKey(job.projectId),
            );
            await insertEvidence(tx, {
              kind: "assessment_job",
              summary: `Assessment job ${job.id} failed after ${job.attempts} attempt(s).`,
              projectId: project.id,
              detail: {
                phase: "failed",
                jobId: job.id,
                attempts: job.attempts,
                error: errorMessage,
              },
            });
          });
        }
      } catch (evidenceError) {
        reportWarning(
          evidenceError instanceof Error
            ? evidenceError.message
            : "Could not record assessment failure evidence.",
          { code: "assessment_job_failure_evidence_failed", jobId: job.id },
        );
      }
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
