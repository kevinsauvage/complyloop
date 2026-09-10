/**
 * Shared `dom`-location building primitives for the runtime engines (axe,
 * Playwright custom probes, html-validate). Keep the whitespace-normalization
 * and truncation behaviour identical across engines so findings render the
 * same snippet shape regardless of source.
 *
 * DELIBERATE COPY: `serializeDocument` in `html-validate-runtime.ts` re-inlines
 * the same 197/200 truncation (see {@link HTML_SNIPPET_TRUNCATE_LENGTH}) because
 * it is injected into the page as serialized source and cannot import. Keep
 * those literals identical to {@link htmlSnippet}.
 */

/** Chars kept before appending `…` when a snippet exceeds {@link HTML_SNIPPET_MAX_LENGTH}. */
export const HTML_SNIPPET_TRUNCATE_LENGTH = 197;

/** Max snippet length including the ellipsis character. */
export const HTML_SNIPPET_MAX_LENGTH = 200;

/**
 * Collapses whitespace and truncates an element's HTML to ≤200 chars.
 * Uses numeric literals (not the exported consts) so `.toString()` stays
 * self-contained for Playwright injection — keep literals in sync with
 * {@link HTML_SNIPPET_TRUNCATE_LENGTH} / {@link HTML_SNIPPET_MAX_LENGTH}.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncateSnippet(text: string): string {
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}

/**
 * Collapses whitespace and truncates an element's HTML to ≤200 chars.
 * Self-contained for Playwright injection (`htmlSnippet.toString()` runs in
 * the page and cannot call sibling helpers) — keep logic identical to
 * {@link collapseWhitespace} + {@link truncateSnippet}.
 */
export function htmlSnippet(html: string): string {
  const trimmed = html.replace(/\s+/g, " ").trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

/** Dedupe-key form: collapsed whitespace + lowercase (not truncated). */
export function normalizeSnippetKey(text: string): string {
  return collapseWhitespace(text).toLowerCase();
}

/** First CSS selector from an element's target path, with an unknown fallback. */
export function selectorFromTarget(target: readonly string[]): string {
  const first = target[0];
  return typeof first === "string" && first.length > 0 ? first : "(unknown)";
}
