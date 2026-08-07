import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import { persistCatalogToPostgres } from "./postgres-persist-catalog";
import { persistRuntimeToPostgres } from "./postgres-persist-runtime";

/**
 * Replaces mutable collections; evidence is insert-only (never updated/deleted).
 * Prefer `withDbWrite` for mutations so load + save share one lock.
 */
export async function saveDbToPostgres(
  drizzle: DrizzleDb,
  db: Db,
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await persistDbToPostgres(tx as unknown as DrizzleDb, db);
  });
}

/** Persist within an existing transaction (used by advisory-locked writers). */
export async function persistDbToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
  await persistCatalogToPostgres(tx, db);
  await persistRuntimeToPostgres(tx, db);
}
