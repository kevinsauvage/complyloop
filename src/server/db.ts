import path from "node:path";
import type { EvidenceRecord } from "@/core/types";
import { getDrizzle, isPostgresConfigured } from "./db-store/client";
import { dataDir, loadDbFromJson, saveDbToJson } from "./db-store/json";
import { loadDbFromPostgres, saveDbToPostgres } from "./db-store/postgres";
import type { Db } from "./db-store/types";

export type { Db } from "./db-store/types";

/**
 * Persistence boundary: JSON under `$DATA_DIR/db.json` by default, or Postgres
 * via Drizzle when `DATABASE_URL` is set. Callers keep the in-memory `Db` shape.
 */
export function workspacesDir(): string {
  return path.join(dataDir(), "workspaces");
}

export async function loadDb(): Promise<Db> {
  if (isPostgresConfigured()) {
    return loadDbFromPostgres(getDrizzle());
  }
  return loadDbFromJson();
}

export async function saveDb(db: Db): Promise<void> {
  if (isPostgresConfigured()) {
    await saveDbToPostgres(getDrizzle(), db);
    return;
  }
  saveDbToJson(db);
}

/** Evidence is append-only: records are added here and never mutated or removed. */
export function addEvidence(
  db: Db,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record: EvidenceRecord = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
  db.evidence.push(record);
  return record;
}

export { isPostgresConfigured } from "./db-store/client";
