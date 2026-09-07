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
