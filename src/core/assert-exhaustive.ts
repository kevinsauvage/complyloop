/** Lookup a value in a record, throwing exhaustiveness error when absent. */
export function lookupExhaustive<T extends string, V>(
  record: Record<T, V>,
  key: string,
  kind: string,
): V {
  const value = record[key as T];
  if (value === undefined) {
    throw new Error(`Unhandled ${kind}: ${key}`);
  }
  return value;
}
