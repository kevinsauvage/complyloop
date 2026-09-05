import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/finding-types";
import type { Requirement } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "../client.ts";
import { insertAlerts } from "./alerts.ts";
import { insertAssessment } from "./assessments.ts";
import { insertEvidenceRecords } from "./evidence.ts";
import { upsertFindings } from "./findings.ts";
import { upsertRemediations } from "./remediations.ts";
import {
  upsertRequirements,
  type UpsertRequirementsOptions,
} from "./requirements.ts";

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
  await persistProjectSliceDiff(
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
    // Canonical-order equality: the `*ToRow` mappers must keep a stable key
    // order, or a same-state row would "change" on every write. Pinned by
    // packages/db/src/repo/mappers.test.ts.
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

export function requirementUpdatedAtById(
  items: ReadonlyArray<Requirement>,
): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.updatedAt]));
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
    { loadedUpdatedAtById: requirementUpdatedAtById(before.requirements) },
  );
  await upsertFindings(
    tx,
    changedEntities(entityMap(before.findings), after.findings),
  );
  await upsertRemediations(
    tx,
    changedEntities(entityMap(before.remediations), after.remediations),
  );
  await insertAlerts(
    tx,
    changedEntities(entityMap(before.alerts), after.alerts),
  );
  await insertEvidenceRecords(tx, evidence);
}

export interface TargetedProjectWritePayload {
  findings?: Finding[];
  remediations?: Remediation[];
  requirements?: Requirement[];
  evidence?: EvidenceRecord[];
  alerts?: Alert[];
}

export interface PersistTargetedProjectWriteOptions {
  loadedRequirementUpdatedAtById?: ReadonlyMap<string, string>;
}

/** Persists explicit row upserts for hot-path actions (no whole-slice diff). */
export async function persistTargetedProjectWrite(
  tx: DrizzleDb,
  payload: TargetedProjectWritePayload,
  options: PersistTargetedProjectWriteOptions = {},
): Promise<void> {
  const requirementOptions: UpsertRequirementsOptions | undefined =
    options.loadedRequirementUpdatedAtById
      ? { loadedUpdatedAtById: options.loadedRequirementUpdatedAtById }
      : undefined;
  await upsertFindings(tx, payload.findings ?? []);
  await upsertRemediations(tx, payload.remediations ?? []);
  await upsertRequirements(
    tx,
    payload.requirements ?? [],
    requirementOptions ?? {},
  );
  await insertAlerts(tx, payload.alerts ?? []);
  await insertEvidenceRecords(tx, payload.evidence ?? []);
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
