import type { EvidenceRecord } from "@/core/finding-types";
import { evidence } from "./schema";

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

/** Evidence ids present in memory but not yet in Postgres (append-only insert set). */
export function evidenceRecordsToInsert(
  records: ReadonlyArray<EvidenceRecord>,
  existingIds: ReadonlySet<string>,
): EvidenceRecord[] {
  return records.filter((record) => !existingIds.has(record.id));
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
