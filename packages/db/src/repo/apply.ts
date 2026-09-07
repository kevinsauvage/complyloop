import type { Alert, Assessment, AssessmentSnapshot, EvidenceRecord, Finding, Remediation } from "../types";
import type { Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../client.ts";
import { insertAssessment } from "./assessments.ts";
import { insertAlerts } from "./alerts.ts";
import { insertEvidenceRecords } from "./evidence.ts";
import { upsertFindings } from "./findings.ts";
import { upsertRemediations } from "./remediations.ts";
import {
  upsertRequirements,
  type UpsertRequirementsOptions,
} from "./requirements.ts";
import { updateProject } from "./projects.ts";

export interface AssessmentApplyPayload {
  assessment: Assessment;
  snapshot: AssessmentSnapshot;
  evidence: EvidenceRecord[];
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  alerts: Alert[];
}

export interface ApplyAssessmentPayloadOptions {
  /** Project slice captured when the assessment job loaded the project. */
  loadedSlice: ProjectSlice;
}

export async function applyAssessmentPayload(
  tx: DrizzleDb,
  payload: AssessmentApplyPayload,
  options: ApplyAssessmentPayloadOptions,
): Promise<void> {
  await insertAssessment(tx, payload.assessment, payload.snapshot);
  await persistProjectRows(
    tx,
    {
      requirements: payload.requirements,
      findings: payload.findings,
      remediations: payload.remediations,
      alerts: payload.alerts,
      evidence: payload.evidence,
    },
    {
      loadedRequirementUpdatedAtById: requirementUpdatedAtById(
        options.loadedSlice.requirements,
      ),
      loadedFindingUpdatedAtById: updatedAtById(options.loadedSlice.findings),
      loadedRemediationUpdatedAtById: updatedAtById(
        options.loadedSlice.remediations,
      ),
    },
  );
}

export interface ProjectSlice {
  requirements: Requirement[];
  findings: Finding[];
  remediations: Remediation[];
  alerts: Alert[];
}

/**
 * Captures project-scoped rows (and their `updatedAt` values) when an
 * assessment job loads the project, for stale-write guards on apply.
 */
export function snapshotProjectSlice(
  requirements: ReadonlyArray<Requirement>,
  findings: ReadonlyArray<Finding>,
  remediations: ReadonlyArray<Remediation>,
  alerts: ReadonlyArray<Alert>,
  projectId: string,
): ProjectSlice {
  const projectFindings = findings.filter(
    (item) => item.projectId === projectId,
  );
  const findingIds = new Set(projectFindings.map((item) => item.id));
  return structuredClone({
    requirements: requirements.filter((item) => item.projectId === projectId),
    findings: projectFindings,
    remediations: remediations.filter((item) => findingIds.has(item.findingId)),
    alerts: alerts.filter((item) => item.projectId === projectId),
  });
}

export function requirementUpdatedAtById(
  items: ReadonlyArray<Requirement>,
): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.updatedAt]));
}

/** `updatedAt` per id for entities that carry it (findings, remediations). */
export function updatedAtById(
  items: ReadonlyArray<{ id: string; updatedAt?: string }>,
): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const item of items) {
    if (item.updatedAt !== undefined) {
      entries.push([item.id, item.updatedAt]);
    }
  }
  return new Map(entries);
}

export interface ProjectWritePayload {
  findings?: Finding[];
  remediations?: Remediation[];
  requirements?: Requirement[];
  evidence?: EvidenceRecord[];
  alerts?: Alert[];
  project?: Project;
}

export interface PersistProjectRowsOptions {
  loadedRequirementUpdatedAtById?: ReadonlyMap<string, string>;
  loadedFindingUpdatedAtById?: ReadonlyMap<string, string>;
  loadedRemediationUpdatedAtById?: ReadonlyMap<string, string>;
}

export async function persistProjectRows(
  tx: DrizzleDb,
  payload: ProjectWritePayload,
  options: PersistProjectRowsOptions = {},
): Promise<void> {
  const requirementOptions: UpsertRequirementsOptions | undefined =
    options.loadedRequirementUpdatedAtById
      ? { loadedUpdatedAtById: options.loadedRequirementUpdatedAtById }
      : undefined;

  await upsertFindings(tx, payload.findings ?? [], {
    loadedUpdatedAtById: options.loadedFindingUpdatedAtById,
  });
  await upsertRemediations(tx, payload.remediations ?? [], {
    loadedUpdatedAtById: options.loadedRemediationUpdatedAtById,
  });
  await upsertRequirements(
    tx,
    payload.requirements ?? [],
    requirementOptions ?? {},
  );
  await insertAlerts(tx, payload.alerts ?? []);
  await insertEvidenceRecords(tx, payload.evidence ?? []);
  if (payload.project) {
    await updateProject(tx, payload.project);
  }
}

export function buildAssessmentApplyPayload(input: {
  assessment: Assessment;
  snapshot: AssessmentSnapshot;
  evidence: EvidenceRecord[];
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  alerts: Alert[];
}): AssessmentApplyPayload {
  return {
    assessment: input.assessment,
    snapshot: input.snapshot,
    evidence: input.evidence,
    findings: input.findings.filter(
      (finding) => finding.projectId === input.assessment.projectId,
    ),
    remediations: input.remediations.filter((remediation) =>
      input.findings.some((finding) => finding.id === remediation.findingId),
    ),
    requirements: input.requirements.filter(
      (requirement) => requirement.projectId === input.assessment.projectId,
    ),
    alerts: input.alerts.filter(
      (alert) => alert.projectId === input.assessment.projectId,
    ),
  };
}
