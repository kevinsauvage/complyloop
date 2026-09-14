export function mustGet<T extends string, V>(
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
