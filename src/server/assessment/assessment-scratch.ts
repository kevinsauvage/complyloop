import type {
  Assessment,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { cloneProjectRows, type ProjectRows } from "../workspace/project-rows";
import {
  clearExpiredExceptions,
  upsertRequirementsById,
} from "./assessment-status";

/**
 * Narrow pipeline input — the assessment needs project-scoped rows only, never
 * the full tenancy `WorkspaceSlice` (orgs, memberships, evidence window,
 * alerts). Use {@link toPipelineInput} to narrow a loaded slice at the single
 * call site.
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

/** Assessment-owned scratch rows: clone project rows, drop expired temporary exceptions, seed run evidence. */
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
