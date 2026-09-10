import type { Alert, Assessment, AssessmentSnapshot, EvidenceRecord, Finding, Remediation } from "../types";
import type { Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../client.ts";
import { insertAssessment } from "./assessments.ts";
import { insertAlerts } from "./alerts.ts";
import { insertEvidenceRecords } from "./evidence.ts";
import { upsertFindings } from "./findings.ts";
import { upsertRemediations } from "./remediations.ts";
import { upsertRequirements } from "./requirements.ts";
import { updateProject } from "./projects.ts";

/**
 * Project-scoped runtime rows. One shape for stale-write snapshots, assessment
 * apply bodies, and (with empty alerts) assessment scratch copies.
 */
export interface ProjectSlice {
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  alerts: Alert[];
}

/**
 * Rows an interactive or assessment write may persist. Assessment apply adds
 * {@link AssessmentApplyPayload.assessment} + snapshot on top of this.
 */
export interface ProjectWritePayload {
  findings?: Finding[];
  remediations?: Remediation[];
  requirements?: Requirement[];
  evidence?: EvidenceRecord[];
  alerts?: Alert[];
  project?: Project;
}

/** Assessment apply = insert assessment metadata, then persist a write payload. */
export interface AssessmentApplyPayload extends ProjectWritePayload {
  assessment: Assessment;
  snapshot: AssessmentSnapshot;
}

export interface ApplyAssessmentPayloadOptions {
  /** Project slice captured when the assessment job loaded the project. */
  loadedSlice: ProjectSlice;
}

export interface PersistProjectRowsOptions {
  /**
   * Slice loaded at the start of the write. `persistProjectRows` derives the
   * per-entity `updatedAt` maps for stale-write guards from this.
   */
  loadedSlice?: Pick<ProjectSlice, "findings" | "remediations" | "requirements">;
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
  return structuredClone(
    projectScopedSlice(
      { findings, remediations, requirements, alerts },
      projectId,
    ),
  );
}

export function requirementUpdatedAtById(
  items: ReadonlyArray<Requirement>,
): Map<string, string> {
  return updatedAtById(items);
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

/** True when two JSON values match, ignoring top-level `updatedAt`. */
function equalIgnoringUpdatedAt(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
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
 * Drops items whose content matches the loaded slice (ignoring `updatedAt`),
 * so re-persisting an unchanged slice is a true no-op and does not churn
 * `updatedAt` stamps. New ids and real changes are kept.
 */
function changedSinceLoaded<T extends { id: string }>(
  loaded: ReadonlyArray<T> | undefined,
  next: ReadonlyArray<T> | undefined,
): T[] {
  if (!next || next.length === 0) return [];
  if (!loaded || loaded.length === 0) return [...next];
  const loadedById = new Map(loaded.map((item) => [item.id, item]));
  return next.filter((item) => {
    const prior = loadedById.get(item.id);
    return !prior || !equalIgnoringUpdatedAt(prior, item);
  });
}

export async function persistProjectRows(
  tx: DrizzleDb,
  payload: ProjectWritePayload,
  options: PersistProjectRowsOptions = {},
): Promise<void> {
  const slice = options.loadedSlice;
  await upsertFindings(tx, changedSinceLoaded(slice?.findings, payload.findings), {
    loadedUpdatedAtById: slice ? updatedAtById(slice.findings) : undefined,
  });
  await upsertRemediations(
    tx,
    changedSinceLoaded(slice?.remediations, payload.remediations),
    {
      loadedUpdatedAtById: slice ? updatedAtById(slice.remediations) : undefined,
    },
  );
  await upsertRequirements(
    tx,
    changedSinceLoaded(slice?.requirements, payload.requirements),
    {
      loadedUpdatedAtById: slice
        ? requirementUpdatedAtById(slice.requirements)
        : undefined,
    },
  );
  await insertAlerts(tx, payload.alerts ?? []);
  await insertEvidenceRecords(tx, payload.evidence ?? []);
  if (payload.project) {
    await updateProject(tx, payload.project);
  }
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
    { loadedSlice: options.loadedSlice },
  );
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
  const slice = projectScopedSlice(
    {
      findings: input.findings,
      remediations: input.remediations,
      requirements: input.requirements,
      alerts: input.alerts,
    },
    input.assessment.projectId,
  );
  return {
    assessment: input.assessment,
    snapshot: input.snapshot,
    evidence: input.evidence,
    ...slice,
  };
}
