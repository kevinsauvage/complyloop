import type {
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/db/types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import {
  projectScopedSlice,
  type ProjectSlice,
} from "@complyloop/db/repo/apply";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";

/**
 * Working copy of project-scoped rows for one assessment run.
 * Same filter as {@link ProjectSlice}; evidence starts empty and is appended
 * during the run. Alerts are collected separately by the worker.
 */
export type ProjectRows = Omit<ProjectSlice, "alerts"> & {
  evidence: EvidenceRecord[];
};

/** Clone project-scoped findings/remediations/requirements; evidence starts empty. */
export function cloneProjectRows(
  findings: ReadonlyArray<Finding>,
  remediations: ReadonlyArray<Remediation>,
  requirements: ReadonlyArray<Requirement>,
  projectId: string,
): ProjectRows {
  const slice = structuredClone(
    projectScopedSlice(
      { findings, remediations, requirements, alerts: [] },
      projectId,
    ),
  );
  return {
    findings: slice.findings,
    remediations: slice.remediations,
    requirements: slice.requirements,
    evidence: [],
  };
}

export function appendEvidence(
  rows: ProjectRows,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record = newEvidenceRecord(entry);
  rows.evidence.push(record);
  return record;
}

/**
 * Installs an assessment run into an in-memory `Db` (tests / local continuity).
 * Production persists via `applyAssessmentPayload` instead.
 */
export function materializeAssessmentRun(
  db: {
    findings: Finding[];
    remediations: Remediation[];
    requirements: Requirement[];
    assessments: Array<{ id: string; projectId: string }>;
    evidence: EvidenceRecord[];
  },
  run: {
    assessment: { id: string; projectId: string };
    findings: Finding[];
    remediations: Remediation[];
    requirements: Requirement[];
    evidence: EvidenceRecord[];
  },
): void {
  const projectId = run.assessment.projectId;
  const previousFindingIds = new Set(
    db.findings
      .filter((finding) => finding.projectId === projectId)
      .map((finding) => finding.id),
  );

  db.findings = [
    ...db.findings.filter((finding) => finding.projectId !== projectId),
    ...run.findings,
  ];
  db.remediations = [
    ...db.remediations.filter(
      (remediation) => !previousFindingIds.has(remediation.findingId),
    ),
    ...run.remediations,
  ];
  db.requirements = [
    ...db.requirements.filter(
      (requirement) => requirement.projectId !== projectId,
    ),
    ...run.requirements,
  ];
  db.assessments = [
    ...db.assessments.filter((assessment) => assessment.id !== run.assessment.id),
    run.assessment as (typeof db.assessments)[number],
  ];
  db.evidence.push(...run.evidence);
}
