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

/** Count items by a derived string key, returning a Map for O(1) lookups. */
export function toCountMap<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
