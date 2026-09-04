import type { EvidenceRecord } from "@/core/finding-types";
import type { DrizzleDb } from "../client";
import { evidenceToRow } from "../postgres-evidence";
import { evidence } from "../schema";
import { newEvidenceRecord } from "./mappers";

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
