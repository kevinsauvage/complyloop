import path from "node:path";
import type { EvidenceRecord } from "@/core/types";
import { getDrizzle, isPostgresConfigured } from "./db-store/client";
import { dataDir, loadDbFromJson, saveDbToJson } from "./db-store/json";
import { loadDbFromPostgres } from "./db-store/postgres-load";
import {
  persistDbToPostgres,
  saveDbToPostgres,
} from "./db-store/postgres-persist";
import type { Db } from "./db-store/types";
import {
  withPostgresAdvisoryLock,
  withProcessWriteLock,
} from "./db-store/write-lock";

export type { Db } from "./db-store/types";

/**
 * Persistence boundary: JSON under `$DATA_DIR/db.json` by default, or Postgres
 * via Drizzle when `DATABASE_URL` is set. Callers keep the in-memory `Db` shape.
 *
 * Prefer {@link withDbWrite} for mutations so concurrent writers cannot clobber
 * each other (process mutex + Postgres advisory lock around load→mutate→save).
 */
export function workspacesDir(): string {
  return path.join(dataDir(), "workspaces");
}

export async function loadDb(): Promise<Db> {
  if (isPostgresConfigured()) {
    return loadDbFromPostgres(await getDrizzle());
  }
  return loadDbFromJson();
}

export async function saveDb(db: Db): Promise<void> {
  if (isPostgresConfigured()) {
    await saveDbToPostgres(await getDrizzle(), db);
    return;
  }
  saveDbToJson(db);
}

/**
 * Exclusive read-modify-write of the store. Use for all mutating server paths
 * (actions, webhooks, seed/org provisioning).
 */
export async function withDbWrite<T>(
  fn: (db: Db) => Promise<T> | T,
): Promise<T> {
  return withProcessWriteLock(async () => {
    if (isPostgresConfigured()) {
      const drizzle = await getDrizzle();
      return withPostgresAdvisoryLock(drizzle, async (tx) => {
        const db = await loadDbFromPostgres(tx);
        const result = await fn(db);
        await persistDbToPostgres(tx, db);
        return result;
      });
    }
    const db = await loadDbFromJson();
    const result = await fn(db);
    saveDbToJson(db);
    return result;
  });
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
