/**
 * Narrows untyped text (query params, DB text columns) to one of a closed set
 * of literals, so callers check membership instead of casting.
 */
export function isOneOf<const T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return values.some((candidate) => candidate === value);
}

/** A zeroed counter per literal (status badges, grouped SQL counts). */
export function zeroCounts<const T extends string>(
  values: readonly T[],
): Record<T, number> {
  // `Object.fromEntries` cannot type its keys; the map covers every `T`.
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<
    T,
    number
  >;
}
