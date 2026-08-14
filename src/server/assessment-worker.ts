import { addEvidence, loadDb, withDbWrite } from "./db";
import {
  claimNextAssessmentJob,
  completeAssessmentJob,
  failAssessmentJob,
  type AssessmentJob,
} from "./assessment-jobs";
import { runAssessment } from "./assessment";
import {
  postPullRequestCheckRun,
  summarizeAssessmentForCheckRun,
} from "./github-checks";
import { resolveProjectGitHubToken } from "./github-access";
import { reportError, reportWarning } from "./observability";
import { withProjectCheckout } from "./repo-checkout";

function collectRegressionAlerts(
  db: Parameters<typeof runAssessment>[0],
  projectId: string,
  assessmentId: string,
  trigger: string,
) {
  const alerts = db.evidence
    .filter(
      (record) =>
        record.assessmentId === assessmentId &&
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true,
    )
    .map((record) => ({
      id: crypto.randomUUID(),
      projectId,
      kind: "compliance_regression" as const,
      summary: `${record.summary} (triggered by ${trigger})`,
      at: new Date().toISOString(),
      read: false,
      assessmentId,
      detail: { ...record.detail, trigger },
    }));
  db.alerts.push(...alerts);
  return alerts;
}

async function runClaimedAssessmentJob(job: AssessmentJob): Promise<void> {
  const snapshot = await loadDb();
  const project = snapshot.projects.find((candidate) => candidate.id === job.projectId);
  if (!project) throw new Error("Project was removed before its assessment job ran.");

  const result = await withProjectCheckout(
    project,
    async (rootPath) =>
      withDbWrite(async (db) => {
        const liveProject = db.projects.find((candidate) => candidate.id === job.projectId);
        if (!liveProject) throw new Error("Project was removed during assessment.");
        const assessment = await runAssessment(db, liveProject.id, { rootPath });
        const trigger = job.payload.eventName ?? "manual assessment";
        const alerts =
          job.trigger === "webhook"
            ? collectRegressionAlerts(db, liveProject.id, assessment.id, trigger)
            : [];
        addEvidence(db, {
          kind: "assessment_job_completed",
          summary: `Assessment job ${job.id} completed for "${liveProject.name}"`,
          projectId: liveProject.id,
          assessmentId: assessment.id,
          detail: { jobId: job.id, trigger: job.trigger, alerts: alerts.length },
        });
        const openViolations = db.findings.filter(
          (finding) =>
            finding.projectId === liveProject.id &&
            finding.status === "open" &&
            finding.kind === "violation",
        ).length;
        const failedRequirements = db.requirements.filter(
          (requirement) =>
            requirement.projectId === liveProject.id &&
            requirement.status === "failed",
        ).length;
        return {
          project: liveProject,
          assessment,
          openViolations,
          failedRequirements,
        };
      }),
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
  if (!job) return { kind: "idle" };
  try {
    await runClaimedAssessmentJob(job);
    await completeAssessmentJob(job.id);
    return { kind: "succeeded", jobId: job.id };
  } catch (error) {
    const status = await failAssessmentJob(job, error);
    if (status === "failed") {
      await withDbWrite((db) => {
        const project = db.projects.find((candidate) => candidate.id === job.projectId);
        if (!project) return;
        addEvidence(db, {
          kind: "assessment_job_failed",
          summary: `Assessment job ${job.id} failed after ${job.attempts} attempt(s).`,
          projectId: project.id,
          detail: {
            jobId: job.id,
            attempts: job.attempts,
            error: error instanceof Error ? error.message : "Assessment job failed.",
          },
        });
      });
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
