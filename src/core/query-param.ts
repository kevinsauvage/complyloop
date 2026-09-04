/** First value from a Next.js searchParams entry (string or string[]). */
export function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
