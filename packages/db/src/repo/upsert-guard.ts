/**
 * Stale-write guard for JSONB-payload entity upserts (requirements, findings,
 * remediations). Skips writes when the DB row is newer than the loaded slice.
 */
export interface StaleWriteOptions {
  /**
   * Entity `updatedAt` values captured when the writing slice was loaded.
   * Rows whose DB copy was updated afterward are skipped so a stale apply
   * cannot revert them.
   */
  loadedUpdatedAtById?: ReadonlyMap<string, string>;
}
export function filterNotStale<T extends { id: string; updatedAt?: string }>(
  items: readonly T[],
  loadedUpdatedAtById: ReadonlyMap<string, string>,
  dbUpdatedAtById: ReadonlyMap<string, string | undefined>,
): T[] {
  return items.filter((item) => {
    const loadedAt = loadedUpdatedAtById.get(item.id);
    const dbUpdatedAt = dbUpdatedAtById.get(item.id);
    if (!loadedAt || !dbUpdatedAt) return true;
    return Date.parse(dbUpdatedAt) <= Date.parse(loadedAt);
  });
}

/**
 * Loads current DB `updatedAt` values and drops items that would overwrite a
 * newer row. When no loaded snapshot is provided, returns a shallow copy.
 */
export async function filterStalePayloadWrites<
  T extends { id: string; updatedAt?: string },
>(
  items: readonly T[],
  loadedUpdatedAtById: ReadonlyMap<string, string> | undefined,
  fetchDbUpdatedAtById: (
    ids: readonly string[],
  ) => Promise<ReadonlyMap<string, string | undefined>>,
): Promise<T[]> {
  if (!loadedUpdatedAtById || loadedUpdatedAtById.size === 0) {
    return [...items];
  }
  const ids = items.map((item) => item.id);
  const dbUpdatedAtById = await fetchDbUpdatedAtById(ids);
  return filterNotStale(items, loadedUpdatedAtById, dbUpdatedAtById);
}

/** Timestamps now — call before persisting so every write bumps `updatedAt`. */
export function stampedNow<T extends object>(item: T): T & { updatedAt: string } {
  return { ...item, updatedAt: new Date().toISOString() };
}

/**
 * Shared JSONB upsert skeleton for entity tables (requirements, findings,
 * remediations): stamp, drop stale writes, map to rows, then hand the
 * surviving rows to `write` for the table-specific insert + conflict clause.
 * No-op when there is nothing to write.
 */
export async function upsertPayloadRows<T extends { id: string; updatedAt?: string }, Row>(
  items: readonly T[],
  loadedUpdatedAtById: ReadonlyMap<string, string> | undefined,
  fetchDbUpdatedAtById: (ids: readonly string[]) => Promise<ReadonlyMap<string, string | undefined>>,
  toRow: (item: T) => Row,
  write: (rows: Row[]) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const toWrite = await filterStalePayloadWrites(
    items.map(stampedNow),
    loadedUpdatedAtById,
    fetchDbUpdatedAtById,
  );
  if (toWrite.length === 0) return;
  await write(toWrite.map(toRow));
}
