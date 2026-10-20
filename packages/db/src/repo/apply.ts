import type {
  Alert,
  Assessment,
  AssessmentSnapshot,
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

import type { DrizzleDb } from "../postgres.ts";
import { upsertAlerts } from "./alerts.ts";
import { insertAssessment } from "./assessments.ts";
import { insertEvidenceRecords } from "./evidence.ts";
import { upsertFindings } from "./findings.ts";
import { upsertRemediations } from "./remediations.ts";
import { upsertRequirements } from "./requirements.ts";

/**
 * Project-scoped runtime rows. Used by the assessment pipeline as the
 * reconcile baseline and by its scratch-row copies — never as an
 * interactive-write input (those load only the rows they touch).
 */
export interface ProjectSlice {
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  alerts: Alert[];
}

/** Rows an assessment apply writes after reconciling a scan against them. */
export interface AssessmentApplyPayload {
  assessment: Assessment;
  snapshot: AssessmentSnapshot;
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  alerts: Alert[];
  evidence: EvidenceRecord[];
}

export interface ApplyAssessmentPayloadOptions {
  /**
   * Project rows loaded inside the apply transaction, under the project write
   * lock, and reconciled against. Used only to skip unchanged writes: the
   * slice is current by construction, so there is no stale-write guard.
   */
  baseline: ProjectSlice;
}

/**
 * Filters findings / remediations / requirements / alerts to one project.
 * Remediations are kept when their finding is in the project-scoped finding set.
 */
export function projectScopedSlice(
  input: {
    findings: ReadonlyArray<Finding>;
    remediations: ReadonlyArray<Remediation>;
    requirements: ReadonlyArray<Requirement>;
    alerts?: ReadonlyArray<Alert>;
  },
  projectId: string,
): ProjectSlice {
  const findings = input.findings.filter(
    (item) => item.projectId === projectId,
  );
  const findingIds = new Set(findings.map((item) => item.id));
  return {
    findings,
    remediations: input.remediations.filter((item) =>
      findingIds.has(item.findingId),
    ),
    requirements: input.requirements.filter(
      (item) => item.projectId === projectId,
    ),
    alerts: (input.alerts ?? []).filter((item) => item.projectId === projectId),
  };
}

/** True when two JSON values match, ignoring top-level `updatedAt`. */
function equalIgnoringUpdatedAt(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((value, index) => equalIgnoringUpdatedAt(value, b[index]));
  }
  const aEntries = Object.entries(a).filter(([key]) => key !== "updatedAt");
  const bEntries = Object.entries(b).filter(([key]) => key !== "updatedAt");
  if (aEntries.length !== bEntries.length) return false;
  for (const [key, value] of aEntries) {
    const other = bEntries.find(([otherKey]) => otherKey === key);
    if (!other || !equalIgnoringUpdatedAt(value, other[1])) return false;
  }
  return true;
}

/**
 * Drops rows whose content matches the reconcile baseline (ignoring
 * `updatedAt`), so re-applying an unchanged reconcile is a true no-op and does
 * not churn `updatedAt` stamps on every scan. Assessment-only: interactive
 * writes already write exactly the rows they changed.
 */
function changedRowsSince<T extends { id: string }>(
  baseline: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): T[] {
  if (next.length === 0) return [];
  if (baseline.length === 0) return [...next];
  const baselineById = new Map(baseline.map((item) => [item.id, item]));
  return next.filter((item) => {
    const prior = baselineById.get(item.id);
    return !prior || !equalIgnoringUpdatedAt(prior, item);
  });
}

/**
 * Assessment apply: the rows were reconciled against `baseline` inside the
 * apply transaction (under the project write lock), so they are current by
 * construction. Unchanged rows are skipped, not rewritten.
 */
export async function applyAssessmentPayload(
  tx: DrizzleDb,
  payload: AssessmentApplyPayload,
  options: ApplyAssessmentPayloadOptions,
): Promise<void> {
  const { baseline } = options;
  await insertAssessment(tx, payload.assessment, payload.snapshot);
  await upsertFindings(
    tx,
    changedRowsSince(baseline.findings, payload.findings),
  );
  await upsertRemediations(
    tx,
    changedRowsSince(baseline.remediations, payload.remediations),
  );
  await upsertRequirements(
    tx,
    changedRowsSince(baseline.requirements, payload.requirements),
  );
  await upsertAlerts(tx, payload.alerts);
  await insertEvidenceRecords(tx, payload.evidence);
}
