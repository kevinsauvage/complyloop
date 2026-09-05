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

/** Timestamps now — call before persisting so every write bumps `updatedAt`. */
export function stampedNow<T extends object>(item: T): T & { updatedAt: string } {
  return { ...item, updatedAt: new Date().toISOString() };
}
