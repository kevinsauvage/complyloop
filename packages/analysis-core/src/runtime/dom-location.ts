/**
 * Shared `dom`-location building primitives for the runtime engines (axe,
 * Playwright custom probes, html-validate). Keep the whitespace-normalization
 * and truncation behaviour identical across engines so findings render the
 * same snippet shape regardless of source.
 */

/** Collapses whitespace and truncates an element's HTML to ≤200 chars. */
export function htmlSnippet(html: string): string {
  const trimmed = html.replace(/\s+/g, " ").trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

/** First CSS selector from an element's target path, with an unknown fallback. */
export function selectorFromTarget(target: readonly string[]): string {
  const first = target[0];
  return typeof first === "string" && first.length > 0 ? first : "(unknown)";
}