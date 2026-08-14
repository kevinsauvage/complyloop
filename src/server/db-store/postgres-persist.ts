import type { Db } from "./types";
import type { DrizzleDb } from "./client";
import { persistCatalogToPostgres } from "./postgres-persist-catalog";
import { persistRuntimeToPostgres } from "./postgres-persist-runtime";

/**
 * Persist within an existing transaction (used by advisory-locked writers).
 * Evidence is insert-only (never updated/deleted). Prefer `withDbWrite` so
 * load + save share one lock.
 *
 * Catalog prune is parent-then-child; mutable FKs use ON DELETE CASCADE so a
 * pruned org/project/assessment cannot leave orphan runtime rows. Evidence is
 * not referenced by those FKs.
 */
export async function persistDbToPostgres(
  tx: DrizzleDb,
  db: Db,
): Promise<void> {
  await persistCatalogToPostgres(tx, db);
  await persistRuntimeToPostgres(tx, db);
}
