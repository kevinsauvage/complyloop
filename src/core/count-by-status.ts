/** Zero-init every status key, then count items by `status`. */
export function countByStatus<T extends string>(
  items: readonly { status: T }[],
  statuses: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    T,
    number
  >;
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

/** Same as {@link countByStatus}, returning a `Map` for UI chip/count consumers. */
export function countByStatusMap<T extends string>(
  items: readonly { status: T }[],
  statuses: readonly T[],
): Map<T, number> {
  const counts = new Map<T, number>(statuses.map((status) => [status, 0]));
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  return counts;
}
