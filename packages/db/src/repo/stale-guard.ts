/**
 * Shared stale-write guard for JSONB-payload entity upserts (requirements,
 * findings, remediations).
 *
 * A write is stale — and must be skipped — when the row's current DB `updatedAt`
 * is newer than the `updatedAt` captured when the writing slice was loaded. This
 * protects human decisions (dismissal, approval, exception) from being reverted
 * by a webhook assessment that applies a slice it loaded before the scan finished.
 *
 * Optional fields: a legacy row with no `updatedAt` writes unconditionally.
 */
export function filterItemsNotStaleInDb<T extends { id: string; updatedAt?: string }>(
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
export function stampedNow<T extends { updatedAt?: string }>(item: T): T {
  return { ...item, updatedAt: new Date().toISOString() };
}