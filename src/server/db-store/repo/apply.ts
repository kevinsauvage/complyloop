import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@/core/finding-types";
import type { Requirement } from "@/core/project-types";
import type { DrizzleDb } from "../client";
import { insertAlerts } from "./alerts";
import { insertAssessment } from "./assessments";
import { insertEvidenceRecords } from "./evidence";
import { upsertFindings } from "./findings";
import { upsertRemediations } from "./remediations";
import { upsertRequirements } from "./requirements";

export interface AssessmentApplyPayload {
  assessment: Assessment;
  snapshot: AssessmentSnapshot;
  evidence: EvidenceRecord[];
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  alerts: Alert[];
}

export async function applyAssessmentPayload(
  tx: DrizzleDb,
  payload: AssessmentApplyPayload,
): Promise<void> {
  await insertAssessment(tx, payload.assessment, payload.snapshot);
  await upsertFindings(tx, payload.findings);
  await upsertRemediations(tx, payload.remediations);
  await upsertRequirements(tx, payload.requirements);
  await insertAlerts(tx, payload.alerts);
  await insertEvidenceRecords(tx, payload.evidence);
}

function entityMap<T extends { id: string }>(
  items: ReadonlyArray<T>,
): Map<string, T> {
  return new Map(items.map((item) => [item.id, structuredClone(item)]));
}

function changedEntities<T extends { id: string }>(
  before: Map<string, T>,
  after: ReadonlyArray<T>,
): T[] {
  const changed: T[] = [];
  for (const item of after) {
    const prev = before.get(item.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
      changed.push(item);
    }
  }
  return changed;
}

export interface ProjectSlice {
  requirements: Requirement[];
  findings: Finding[];
  remediations: Remediation[];
  alerts: Alert[];
}

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
  return {
    requirements: requirements.filter((item) => item.projectId === projectId),
    findings: projectFindings,
    remediations: remediations.filter((item) => findingIds.has(item.findingId)),
    alerts: alerts.filter((item) => item.projectId === projectId),
  };
}

export async function persistProjectSliceDiff(
  tx: DrizzleDb,
  before: ProjectSlice,
  after: ProjectSlice,
  evidence: ReadonlyArray<EvidenceRecord>,
): Promise<void> {
  await upsertRequirements(
    tx,
    changedEntities(entityMap(before.requirements), after.requirements),
  );
  await upsertFindings(
    tx,
    changedEntities(entityMap(before.findings), after.findings),
  );
  await upsertRemediations(
    tx,
    changedEntities(entityMap(before.remediations), after.remediations),
  );
  const alertChanges = changedEntities(entityMap(before.alerts), after.alerts);
  if (alertChanges.length > 0) {
    await insertAlerts(tx, alertChanges);
  }
  if (evidence.length > 0) {
    await insertEvidenceRecords(tx, evidence);
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
