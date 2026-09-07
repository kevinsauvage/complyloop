import type { EvidenceRecord } from "@complyloop/db/types";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";

/** Append one evidence row onto a project write payload. */
export function evidenceEntry(
  payload: ProjectWritePayload,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record = newEvidenceRecord(entry);
  payload.evidence = [...(payload.evidence ?? []), record];
  return record;
}
