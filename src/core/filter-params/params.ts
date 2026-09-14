/**
 * Shared query-param parsing primitives for filter-params.
 *
 * Next.js searchParams values arrive as `string | string[] | undefined`;
 * every parser takes the first value and treats missing/empty as undefined.
 */

/** First query-param value, or undefined when missing/empty. */
export function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return value;
}

/** Trimmed search query capped at `maxLength` chars (default 100). */
export function trimmedQuery(
  raw: string | string[] | undefined,
  maxLength = 100,
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, maxLength).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
