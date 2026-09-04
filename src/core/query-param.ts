/** First value from a Next.js searchParams entry (string or string[]). */
export function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/** Extract a string that must match one of the allowed values. */
export function parseEnumParam(
  raw: string | string[] | undefined,
  allowed: readonly string[],
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return allowed.includes(value) ? value : undefined;
}
