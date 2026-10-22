/**
 * Assessment pipeline owner.
 *
 * Single place that answers "how does an assessment run?":
 * narrow input → `scanAssessment` (checkout → raw findings + snapshot) →
 * `reconcileAssessment` on rows loaded inside the apply transaction → persist.
 * The worker (`assessment-worker.ts`) does load → `scanAssessment` →
 * `applyAuthoritativeAssessment`, with no inline status/alert/evidence logic.
 *
 * Scratch-row ownership lives here (not in `workspace/project-rows.ts`):
 * `createAssessmentScratch` is the only assessment-side composer of
 * `cloneProjectRows` + `clearExpiredExceptions` + `upsertRequirementsById`.
 * `appendEvidence` stays shared in `workspace/project-rows.ts` — it is a
 * generic evidence helper also used by interactive actions.
 */
import "server-only";

import type { Alert } from "@complyloop/analysis-core/contract/entities";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import {
  acquireNamedPostgresAdvisoryLock,
  getDrizzle,
  projectWriteLockKey,
} from "@complyloop/db/postgres";
import { listAlertsForProject } from "@complyloop/db/repo/alerts";
import {
  applyAssessmentPayload,
  type ProjectSlice,
} from "@complyloop/db/repo/apply";
import { getAssessmentJobStatus } from "@complyloop/db/repo/assessment-jobs";
import { insertEvidence } from "@complyloop/db/repo/evidence";
import { loadProjectRuntime } from "@complyloop/db/workspace-load";

import type { AssessmentJobStage } from "@/core/assessment/assessment-jobs";

import { reportWarning } from "../observability";
import { loadProjectDb, withProjectLock } from "../workspace/db";
import { appendEvidence, type ProjectRows } from "../workspace/project-rows";
import { type AssessmentRunResult, reconcileAssessment } from "./assessment";
import {
  type AssessmentJob,
  AssessmentJobCancelledError,
} from "./assessment-jobs";
import type { AssessmentScanResult } from "./assessment-scan";
export {
  type AssessmentPipelineInput,
  createAssessmentScratch,
  toPipelineInput,
} from "./assessment-scratch";

/**
 * Persists an authoritative run under the project write lock. It loads the
 * project's rows *inside* the transaction, under the lock, and reconciles the
 * scan against them; the regression alerts then come from a fresh alert read.
 * Reconciling on freshly loaded rows — rather than on the slice loaded before
 * a scan that can take minutes — is what keeps the audit trail consistent with
 * persisted state when a user edits a finding mid-scan. Preview (PR-head) runs
 * never reach here.
 */
export async function applyAuthoritativeAssessment(input: {
  project: Project;
  job: AssessmentJob;
  scan: AssessmentScanResult;
  rootPath: string;
  collectAlerts: boolean;
  trigger: string;
  /** Test override for the controls used during reconcile. */
  controls?: readonly Control[];
  onStage?: (stage: AssessmentJobStage) => void;
}): Promise<void> {
  const { project, job, scan, rootPath, collectAlerts, trigger } = input;
  const drizzle = await getDrizzle();
  await drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(project.id));
    // Cancel-safety: a cancel landing after the worker's pre-apply check must
    // still discard the run. Re-check the job status inside the transaction
    // (under the project lock) so the check and the writes are atomic —
    // throwing here rolls everything back and the worker reports `cancelled`.
    if ((await getAssessmentJobStatus(tx, job.id)) !== "running") {
      throw new AssessmentJobCancelledError(job.id);
    }

    // Load rows under the lock and reconcile against them. `reconcileAssessment`
    // clones its input, so `baseline` stays the unchanged pre-reconcile slice
    // used for the no-op diff (unchanged rows are not rewritten).
    const fresh = await loadProjectRuntime(tx, project.id);
    const baseline: ProjectSlice = {
      findings: fresh.findings,
      remediations: fresh.remediations,
      requirements: fresh.requirements,
      alerts: fresh.alerts,
    };
    const run = await reconcileAssessment(
      {
        project,
        findings: fresh.findings,
        remediations: fresh.remediations,
        requirements: fresh.requirements,
        assessments: fresh.assessments,
      },
      scan,
      {
        rootPath,
        authoritative: true,
        controls: input.controls,
        onStage: input.onStage,
      },
    );
    const snapshot = run.assessment.snapshot;
    if (!snapshot) {
      throw new Error("Assessment completed without a snapshot.");
    }

    // Alerts are built from a read inside the transaction (under the project
    // write lock): matching against a pre-scan slice could refresh an alert the
    // user just read or mint duplicates of one just created.
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
        assessment: run.assessment,
        snapshot,
        evidence: run.evidence,
        findings: run.findings,
        remediations: run.remediations,
        requirements: run.requirements,
        alerts,
      },
      { baseline },
    );
    await insertEvidence(tx, {
      kind: "assessment_job",
      summary: `Assessment job ${job.id} completed for "${project.name}"`,
      projectId: project.id,
      assessmentId: run.assessment.id,
      detail: {
        phase: "completed",
        jobId: job.id,
        trigger: job.trigger,
        alerts: alerts.length,
        leaseExpiresAt: job.leaseExpiresAt,
        // Which pushed SHAs this run absorbed without scanning individually
        // (webhook coalescing) — answers "was commit X assessed?".
        ...(job.payload.supersededRefs?.length
          ? { supersededRefs: job.payload.supersededRefs }
          : {}),
      },
    });
  });
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
 * Records job-failure evidence under the project write lock so it serializes
 * with concurrent assessment applies — for terminal failures and for retries
 * (a Pipeline showing "retrying" otherwise has no durable record of why).
 * Never masks the original job failure — reports bookkeeping errors as
 * warnings instead.
 */
export async function recordAssessmentFailureEvidence(input: {
  projectId: string;
  job: AssessmentJob;
  error: unknown;
  phase: "failed" | "retrying";
}): Promise<void> {
  const { projectId, job, error, phase } = input;
  try {
    const db = await loadProjectDb(projectId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const errorMessage =
      error instanceof Error ? error.message : "Assessment job failed.";
    await withProjectLock(projectId, async (tx) => {
      await insertEvidence(tx, {
        kind: "assessment_job",
        summary:
          phase === "failed"
            ? `Assessment job ${job.id} failed after ${job.attempts} attempt(s).`
            : `Assessment job ${job.id} failed attempt ${job.attempts}; retrying.`,
        projectId: project.id,
        detail: {
          phase,
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
