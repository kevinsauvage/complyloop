import type { Alert } from "@complyloop/analysis-core/contract/finding-types";
import {
  claimNextAssessmentJob,
  completeAssessmentJob,
  failAssessmentJob,
  type AssessmentJob,
} from "./assessment-jobs";
import { runAssessment } from "./assessment";
import { loadProjectDb, type Db } from "./db";
import { getDrizzle } from "@complyloop/db/client";
import {
  applyAssessmentPayload,
  buildAssessmentApplyPayload,
} from "@complyloop/db/repo/apply";
import { insertEvidence } from "@complyloop/db/repo/evidence";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "./github-checks";
import { resolveProjectGitHubToken } from "./github-access";
import { reportError, reportWarning } from "./observability";
import { pruneRateLimitBuckets } from "./rate-limit";
import { withProjectCheckout } from "./repo-checkout";

function collectRegressionAlerts(
  db: Db,
  projectId: string,
  assessmentId: string,
  trigger: string,
): Alert[] {
  const assessment = db.assessments.find((candidate) => candidate.id === assessmentId);
  const primaryChange = assessment?.changesSincePrevious?.[0];

  return db.evidence
    .filter(
      (record) =>
        record.assessmentId === assessmentId &&
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    )
    .map((record) => {
      const openFinding = record.controlId
        ? db.findings.find(
            (finding) =>
              finding.projectId === projectId &&
              finding.controlId === record.controlId &&
              finding.status === "open",
          )
        : undefined;

      return {
        id: crypto.randomUUID(),
        projectId,
        kind: "compliance_regression" as const,
        summary: `${record.summary} (triggered by ${trigger})`,
        at: new Date().toISOString(),
        read: false,
        assessmentId,
        detail: {
          ...record.detail,
          trigger,
          controlId: record.controlId,
          findingId: openFinding?.id,
          commitSha: assessment?.snapshot?.gitHead,
          changeFilePath: primaryChange?.filePath,
        },
      };
    });
}

async function runClaimedAssessmentJob(job: AssessmentJob): Promise<void> {
  // One load for the whole job: the checkout touches the filesystem, not the
  // DB, so the slice stays fresh. The FK cascade on project deletion still
  // fails the apply transaction loudly if the project disappears mid-run.
  const db = await loadProjectDb(job.projectId);
  const project = db.projects.find(
    (candidate) => candidate.id === job.projectId,
  );
  if (!project) throw new Error("Project was removed before its assessment job ran.");

  const result = await withProjectCheckout(
    project,
    async (rootPath) => {
      const evidenceStart = db.evidence.length;
      const assessment = await runAssessment(db, project.id, {
        rootPath,
      });
      const trigger = job.payload.eventName ?? "manual assessment";
      const alerts =
        job.trigger === "webhook"
          ? collectRegressionAlerts(db, project.id, assessment.id, trigger)
          : [];

      const snapshot = assessment.snapshot;
      if (!snapshot) {
        throw new Error("Assessment completed without a snapshot.");
      }

      const drizzle = await getDrizzle();
      await drizzle.transaction(async (tx) => {
        await applyAssessmentPayload(
          tx,
          buildAssessmentApplyPayload({
            assessment,
            snapshot,
            evidence: db.evidence.slice(evidenceStart),
            findings: db.findings,
            remediations: db.remediations,
            requirements: db.requirements,
            alerts,
          }),
        );
        await insertEvidence(tx, {
          kind: "assessment_job_completed",
          summary: `Assessment job ${job.id} completed for "${project.name}"`,
          projectId: project.id,
          assessmentId: assessment.id,
          detail: { jobId: job.id, trigger: job.trigger, alerts: alerts.length },
        });
      });

      const openViolations = db.findings.filter(
        (finding) =>
          finding.projectId === project.id &&
          finding.status === "open" &&
          finding.kind === "violation",
      ).length;
      const failedRequirements = db.requirements.filter(
        (requirement) =>
          requirement.projectId === project.id &&
          requirement.status === "failed",
      ).length;
      return {
        project,
        assessment,
        openViolations,
        failedRequirements,
      };
    },
    job.payload.ref,
  );

  if (job.trigger !== "webhook" || !job.payload.pullRequestHeadSha) return;
  const token = await resolveProjectGitHubToken(result.project);
  if (!token || !result.project.github?.fullName) {
    reportWarning("Could not post pull-request check: GitHub token unavailable.", {
      code: "github_token_missing",
      projectId: result.project.id,
      jobId: job.id,
    });
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
    try {
      await pruneRateLimitBuckets();
    } catch (error) {
      reportWarning(
        error instanceof Error ? error.message : "Rate-limit bucket prune failed.",
        { code: "rate_limit_prune_failed" },
      );
    }
    return { kind: "idle" };
  }
  try {
    await runClaimedAssessmentJob(job);
    await completeAssessmentJob(job.id);
    return { kind: "succeeded", jobId: job.id };
  } catch (error) {
    const status = await failAssessmentJob(job, error);
    if (status === "failed") {
      const db = await loadProjectDb(job.projectId);
      const project = db.projects.find(
        (candidate) => candidate.id === job.projectId,
      );
      if (project) {
        const errorMessage =
          error instanceof Error ? error.message : "Assessment job failed.";
        const drizzle = await getDrizzle();
        await drizzle.transaction(async (tx) => {
          await insertEvidence(tx, {
            kind: "assessment_job_failed",
            summary: `Assessment job ${job.id} failed after ${job.attempts} attempt(s).`,
            projectId: project.id,
            detail: {
              jobId: job.id,
              attempts: job.attempts,
              error: errorMessage,
            },
          });
        });
      }
    }
    reportError(error, {
      code: status === "failed" ? "assessment_job_failed" : "assessment_job_retrying",
      jobId: job.id,
      projectId: job.projectId,
      attempts: job.attempts,
    });
    return { kind: status === "failed" ? "failed" : "retrying", jobId: job.id };
  }
}
