import type { EvidenceRecord } from "@/core/finding-types";
import { getDrizzle } from "./db-store/client";
import {
  loadDbFromPostgres,
  resolveWorkspaceLoadScope,
} from "./db-store/postgres-load";
import { persistDbToPostgres } from "./db-store/postgres-persist";
import { fullLoadScope, workspaceReadEvidenceLimit } from "./db-store/postgres-scope";
import type { Db, DbLoadScope } from "./db-store/types";
import {
  withPostgresAdvisoryLock,
  withProcessWriteLock,
} from "./db-store/write-lock";

export type { Db, DbLoadScope } from "./db-store/types";
export { emptyDb } from "./db-store/types";

/**
 * Persistence boundary: Postgres via Drizzle (`DATABASE_URL` required).
 * Callers keep the in-memory {@link Db} shape.
 *
 * Prefer {@link withDbWrite} for mutations so concurrent writers cannot clobber
 * each other (process mutex + Postgres advisory lock around load→mutate→save).
 * Prefer scoped loads for request paths so evidence JSONB stays bounded.
 */
export async function loadDb(
  scope: DbLoadScope = fullLoadScope(),
): Promise<Db> {
  return loadDbFromPostgres(await getDrizzle(), scope);
}

/**
 * Exclusive read-modify-write of the store. Use for all mutating server paths
 * (actions, webhooks, seed/org provisioning).
 *
 * Pass a scope whenever the writer only touches one tenant/project so prune
 * cannot delete other tenants' rows.
 */
export async function withDbWrite<T>(
  fn: (db: Db) => Promise<T> | T,
  scope: DbLoadScope = fullLoadScope(),
): Promise<T> {
  return withProcessWriteLock(async () => {
    const drizzle = await getDrizzle();
    return withPostgresAdvisoryLock(drizzle, async (tx) => {
      const db = await loadDbFromPostgres(tx, scope);
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

/** Workspace read scope: caller's orgs/projects, capped evidence window. */
export async function loadWorkspaceDb(input: {
  userId: string | null;
  githubLogin: string | null;
  preferredProjectId?: string | null;
}): Promise<Db> {
  const drizzle = await getDrizzle();
  const scope = await resolveWorkspaceLoadScope(drizzle, {
    ...input,
    evidenceLimit: workspaceReadEvidenceLimit(),
  });
  return loadDbFromPostgres(drizzle, scope);
}

/** Workspace write scope: caller's orgs/projects, no historical evidence. */
export async function withWorkspaceDbWrite<T>(
  input: {
    userId: string | null;
    githubLogin: string | null;
    preferredProjectId?: string | null;
  },
  fn: (db: Db) => Promise<T> | T,
): Promise<T> {
  const drizzle = await getDrizzle();
  const scope = await resolveWorkspaceLoadScope(drizzle, {
    ...input,
    evidenceLimit: 0,
  });
  return withDbWrite(fn, scope);
}
