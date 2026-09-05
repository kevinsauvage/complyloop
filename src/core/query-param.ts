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

/**
 * Builds a `base?key=value…` href from a plain record, omitting the `?`
 * when there are no entries. Values must already be encoded strings.
 */
export function buildHref(
  base: string,
  params: Record<string, string>,
): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${base}?${qs}` : base;
}
