export function assertExhaustive(value: string, kind: string): never {
  throw new Error(`Unhandled ${kind}: ${value}`);
}

/** Lookup a value in a record, throwing exhaustiveness error when absent. */
export function lookupExhaustive<T extends string, V>(
  record: Record<T, V>,
  key: string,
  kind: string,
): V {
  return record[key as T] ?? assertExhaustive(key, kind);
}
