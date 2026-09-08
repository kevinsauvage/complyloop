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
