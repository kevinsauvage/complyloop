import type { EvidenceRecord } from "@/core/types";
import { getDrizzle } from "./db-store/client";
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
export { emptyDb } from "./db-store/types";

/**
 * Persistence boundary: Postgres via Drizzle (`DATABASE_URL` required).
 * Callers keep the in-memory {@link Db} shape.
 *
 * Prefer {@link withDbWrite} for mutations so concurrent writers cannot clobber
 * each other (process mutex + Postgres advisory lock around load→mutate→save).
 */
export async function loadDb(): Promise<Db> {
  return loadDbFromPostgres(await getDrizzle());
}

export async function saveDb(db: Db): Promise<void> {
  await saveDbToPostgres(await getDrizzle(), db);
}

/**
 * Exclusive read-modify-write of the store. Use for all mutating server paths
 * (actions, webhooks, seed/org provisioning).
 */
export async function withDbWrite<T>(
  fn: (db: Db) => Promise<T> | T,
): Promise<T> {
  return withProcessWriteLock(async () => {
    const drizzle = await getDrizzle();
    return withPostgresAdvisoryLock(drizzle, async (tx) => {
      const db = await loadDbFromPostgres(tx);
      const result = await fn(db);
      await persistDbToPostgres(tx, db);
      return result;
    });
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
