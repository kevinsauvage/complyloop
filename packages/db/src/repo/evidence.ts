import type { EvidenceRecord } from "../types";
import type { DrizzleDb } from "../client.ts";
import type { Db } from "../types.ts";
import { evidenceToRow } from "../queries.ts";
import { evidence } from "../schema.ts";
import { newEvidenceRecord } from "./mappers.ts";

/** Evidence is append-only: queue a record in memory for a later repo insert. */
export function addEvidence(
  db: Db,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record = newEvidenceRecord(entry);
  db.evidence.push(record);
  return record;
}

export async function insertEvidence(
  tx: DrizzleDb,
  entry: Omit<EvidenceRecord, "id" | "at">,
): Promise<EvidenceRecord> {
  const record = newEvidenceRecord(entry);
  await tx.insert(evidence).values(evidenceToRow(record));
  return record;
}

export async function insertEvidenceRecords(
  tx: DrizzleDb,
  records: ReadonlyArray<EvidenceRecord>,
): Promise<void> {
  if (records.length === 0) return;
  await tx.insert(evidence).values(records.map(evidenceToRow));
}
