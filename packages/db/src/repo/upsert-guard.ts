/**
 * Stale-write protection is the caller's job, not this module's: every
 * project-row writer holds `project-write:{projectId}` for its whole
 * transaction and reads the rows it mutates inside that transaction, so a
 * stale in-memory copy cannot revert a concurrent human decision. See
 * `docs/ai/architecture.md` (write model).
 */

/** Timestamps now — call before persisting so every write bumps `updatedAt`. */
export function stampedNow<T extends object>(
  item: T,
): T & { updatedAt: string } {
  return { ...item, updatedAt: new Date().toISOString() };
}

/**
 * Shared JSONB upsert skeleton for entity tables (requirements, findings,
 * remediations): stamp, map to rows, then hand the rows to `write` for the
 * table-specific insert + conflict clause. No-op when there is nothing to
 * write.
 */
export async function upsertPayloadRows<
  T extends { id: string; updatedAt?: string },
  Row,
>(
  items: readonly T[],
  toRow: (item: T) => Row,
  write: (rows: Row[]) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  await write(items.map(stampedNow).map(toRow));
}
