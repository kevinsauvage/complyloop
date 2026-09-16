/**
 * Assessment pipeline owner.
 *
 * Single place that answers "how does an assessment run?":
 * narrow input → scratch rows → stage sequence (`runAssessment`) → apply.
 * The worker (`assessment-worker.ts`) only does load → `runAssessment` →
 * `applyAuthoritativeAssessment`, with no inline status/alert/evidence logic.
 *
 * Scratch-row ownership lives here (not in `workspace/project-rows.ts`):
 * `createAssessmentScratch` is the only assessment-side composer of
 * `cloneProjectRows` + `clearExpiredExceptions` + `upsertRequirementsById`.
 * `appendEvidence` stays shared in `workspace/project-rows.ts` — it is a
 * generic evidence helper also used by interactive actions.
 */
import "server-only";

import { eq } from "drizzle-orm";

import type {
  Alert,
  Assessment,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  acquireNamedPostgresAdvisoryLock,
  getDrizzle,
  projectWriteLockKey,
} from "@complyloop/db/postgres";
import { listAlertsForProject } from "@complyloop/db/repo/alerts";
import {
  applyAssessmentPayload,
  type ProjectSlice,
  snapshotProjectSlice,
} from "@complyloop/db/repo/apply";
import { insertEvidence } from "@complyloop/db/repo/evidence";
import { assessmentJobs } from "@complyloop/db/schema";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { reportWarning } from "../observability";
import { loadProjectDb, withProjectLock } from "../workspace/db";
import {
  appendEvidence,
  cloneProjectRows,
  type ProjectRows,
} from "../workspace/project-rows";
import type { AssessmentRunResult } from "./assessment";
import {
  type AssessmentJob,
  AssessmentJobCancelledError,
} from "./assessment-jobs";
import {
  clearExpiredExceptions,
  upsertRequirementsById,
} from "./assessment-status";

/**
 * Narrow pipeline input — the assessment needs project-scoped rows only,
 * never the full tenancy `WorkspaceSlice` (orgs, memberships, evidence
 * window, alerts). Use {@link toPipelineInput} to narrow a loaded slice at
 * the single call site.
 */
export interface AssessmentPipelineInput {
  project: Project;
  findings: ReadonlyArray<Finding>;
  remediations: ReadonlyArray<Remediation>;
  requirements: ReadonlyArray<Requirement>;
  assessments: ReadonlyArray<Assessment>;
}

/** Narrow a loaded `WorkspaceSlice` to the pipeline input (single site). */
export function toPipelineInput(
  db: WorkspaceSlice,
  projectId: string,
): AssessmentPipelineInput {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new PublicError("Unknown project.");
  return {
    project,
    findings: db.findings,
    remediations: db.remediations,
    requirements: db.requirements,
    assessments: db.assessments,
  };
}

/**
 * Assessment-owned scratch rows: clone project rows, drop expired temporary
 * exceptions, and seed the run evidence. The only assessment-side composer
 * of the workspace/project-status helpers.
 */
export function createAssessmentScratch(
  input: AssessmentPipelineInput,
): ProjectRows {
  const projectId = input.project.id;
  const rows = cloneProjectRows(
    input.findings,
    input.remediations,
    input.requirements,
    projectId,
  );
  const cleared = clearExpiredExceptions(rows.requirements, projectId);
  rows.requirements = upsertRequirementsById(
    rows.requirements,
    cleared.requirements,
  );
  rows.evidence.push(...cleared.evidence);
  return rows;
}

/** Stale-write snapshot captured when the job loads (for apply guards). */
export function snapshotPipelineSlice(
  input: AssessmentPipelineInput,
): ProjectSlice {
  return snapshotProjectSlice(
    input.requirements,
    input.findings,
    input.remediations,
    [],
    input.project.id,
  );
}

function buildRegressionAlerts(input: {
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

/**
 * Persists an authoritative run under the project write lock: fresh
 * in-transaction alert read (the pre-scan slice may be minutes stale),
 * `applyAssessmentPayload` with stale-write guards, plus the job-completed
 * evidence row. Preview (PR-head) runs never reach here.
 */
export async function applyAuthoritativeAssessment(input: {
  project: Project;
  job: AssessmentJob;
  run: AssessmentRunResult;
  loadedSlice: ProjectSlice;
  collectAlerts: boolean;
  trigger: string;
}): Promise<void> {
  const { project, job, run, loadedSlice, collectAlerts, trigger } = input;
  const { assessment } = run;
  const snapshot = assessment.snapshot;
  if (!snapshot) {
    throw new Error("Assessment completed without a snapshot.");
  }
  const drizzle = await getDrizzle();
  await drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(project.id));
    // Cancel-safety: a cancel landing after the worker's pre-apply check must
    // still discard the run. Re-check the job status inside the transaction
    // (under the project lock) so the check and the writes are atomic —
    // throwing here rolls everything back and the worker reports `cancelled`.
    const [jobRow] = await tx
      .select({ status: assessmentJobs.status })
      .from(assessmentJobs)
      .where(eq(assessmentJobs.id, job.id));
    if (!jobRow || jobRow.status !== "running") {
      throw new AssessmentJobCancelledError(job.id);
    }
    // Read alerts inside the apply transaction (under the project write
    // lock): the pre-scan slice above may be minutes stale, and matching
    // against it could refresh an alert the user just read or mint
    // duplicates of one just created.
    const alerts = collectAlerts
      ? buildRegressionAlerts({
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

/**
 * Records terminal job-failure evidence under the project write lock so it
 * serializes with concurrent assessment applies. Never masks the original
 * job failure — reports bookkeeping errors as warnings instead.
 */
export async function recordAssessmentFailureEvidence(input: {
  projectId: string;
  job: AssessmentJob;
  error: unknown;
}): Promise<void> {
  const { projectId, job, error } = input;
  try {
    const db = await loadProjectDb(projectId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const errorMessage =
      error instanceof Error ? error.message : "Assessment job failed.";
    await withProjectLock(projectId, async (tx) => {
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
  } catch (evidenceError) {
    reportWarning(
      evidenceError instanceof Error
        ? evidenceError.message
        : "Could not record assessment failure evidence.",
      { code: "assessment_job_failure_evidence_failed", jobId: job.id },
    );
  }
}

export { appendEvidence, type ProjectRows };
