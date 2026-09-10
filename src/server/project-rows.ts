import "server-only";
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

/** Append one evidence row onto a scratch container or write payload. */
export function appendEvidence(
  target: { evidence?: EvidenceRecord[] },
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record = newEvidenceRecord(entry);
  if (target.evidence) {
    target.evidence.push(record);
  } else {
    target.evidence = [record];
  }
  return record;
}

/**
 * Stamp user-initiated evidence with its author. Worker/system rows keep
 * `actor` unset (read as "System"). `??=` preserves an explicitly set actor.
 */
export function stampEvidenceActor(
  records: readonly EvidenceRecord[] | undefined,
  actor: string | null | undefined,
): void {
  if (!actor) return;
  for (const record of records ?? []) record.actor ??= actor;
}

/** Insert-or-replace one finding in a scratch row set (shared findIndex/push). */
export function upsertFindingInRows(rows: { findings: Finding[] }, updated: Finding): void {
  const index = rows.findings.findIndex((candidate) => candidate.id === updated.id);
  if (index >= 0) {
    rows.findings[index] = updated;
  } else {
    rows.findings.push(updated);
  }
}
