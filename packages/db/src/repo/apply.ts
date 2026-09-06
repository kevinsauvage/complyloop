import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/finding-types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../client.ts";
import { insertAssessment } from "./assessments.ts";
import { insertAlerts } from "./alerts.ts";
import { insertEvidenceRecords } from "./evidence.ts";
import { upsertFindings } from "./findings.ts";
import { upsertRemediations } from "./remediations.ts";
import { upsertRequirements } from "./requirements.ts";

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
  await persistProjectSlice(
    tx,
    options.loadedSlice,
    {
      requirements: payload.requirements,
      findings: payload.findings,
      remediations: payload.remediations,
      alerts: payload.alerts,
    },
    payload.evidence,
  );
}

export interface ProjectSlice {
  requirements: Requirement[];
  findings: Finding[];
  remediations: Remediation[];
  alerts: Alert[];
}

/**
 * Captures project-scoped rows for stale-write guards when an assessment job
 * loads a slice and mutates those same object references in place.
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

export async function persistProjectSlice(
  tx: DrizzleDb,
  loadedSlice: ProjectSlice,
  after: ProjectSlice,
  evidence: ReadonlyArray<EvidenceRecord>,
): Promise<void> {
  await upsertRequirements(tx, after.requirements, {
    loadedUpdatedAtById: requirementUpdatedAtById(loadedSlice.requirements),
  });
  // The loaded slice's `updatedAt` values guard against reverting a human
  // decision made while a webhook assessment was scanning against that slice.
  await upsertFindings(tx, after.findings, {
    loadedUpdatedAtById: updatedAtById(loadedSlice.findings),
  });
  await upsertRemediations(tx, after.remediations, {
    loadedUpdatedAtById: updatedAtById(loadedSlice.remediations),
  });
  await insertAlerts(tx, after.alerts);
  await insertEvidenceRecords(tx, evidence);
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
