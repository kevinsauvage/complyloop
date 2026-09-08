/**
 * Stale-write guard for JSONB-payload entity upserts (requirements, findings,
 * remediations). Skips writes when the DB row is newer than the loaded slice.
 */
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
