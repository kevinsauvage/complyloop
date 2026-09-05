import type { EvidenceRecord } from "@complyloop/analysis-core/contract/finding-types";
import { evidence } from "./schema.ts";

export function evidenceToRow(record: EvidenceRecord) {
  return {
    id: record.id,
    at: record.at,
    kind: record.kind,
    summary: record.summary,
    projectId: record.projectId ?? null,
    controlId: record.controlId ?? null,
    findingId: record.findingId ?? null,
    assessmentId: record.assessmentId ?? null,
    detail: record.detail ?? null,
  };
}

export function rowToEvidence(
  row: typeof evidence.$inferSelect,
): EvidenceRecord {
  return {
    id: row.id,
    at: row.at,
    kind: row.kind as EvidenceRecord["kind"],
    summary: row.summary,
    projectId: row.projectId ?? undefined,
    controlId: row.controlId ?? undefined,
    findingId: row.findingId ?? undefined,
    assessmentId: row.assessmentId ?? undefined,
    detail: row.detail ?? undefined,
  };
}
