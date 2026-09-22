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

/**
 * Collapses whitespace and truncates an element's HTML to ≤200 chars.
 * Self-contained for Playwright injection (`htmlSnippet.toString()` runs in
 * the page and cannot call sibling helpers) — keep logic identical to
 * {@link collapseWhitespace} + the 200-char truncation.
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

/** Max visible-text chars kept in a derived element label. */
export const ELEMENT_LABEL_TEXT_MAX_LENGTH = 80;

/**
 * Human-readable label for an axe node (`h2 "Headline"`, `a "Contact"`).
 * Axe supplies only `html` + `target` — no accessible name — so derive the
 * identity from the node's own markup: inner text first, then a naming
 * attribute (`alt`, `aria-label`, …), else `tag (selector)`.
 *
 * Pure string parsing (no DOM) so it runs in Node and on already-truncated
 * stored snippets. Operates on the full node HTML when available — call
 * before {@link htmlSnippet} truncation or the text is lost behind classes.
 */
export function describeAxeElement(html: string, selector: string): string {
  const tagMatch = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(html);
  const tag = tagMatch?.[1]?.toLowerCase() ?? "element";
  const text = visibleTextOf(html);
  if (text) return `${tag} \u201c${text}\u201d`;
  const named = namingAttributeOf(html);
  if (named) return `${tag} \u201c${named}\u201d`;
  return `${tag} (${selector})`;
}

/**
 * Visible text with tags stripped, whitespace collapsed, truncated.
 * Returns `""` when there is no real text: truncated snippets cut mid-tag
 * (class-heavy markup, no closing `>`) and markup soup (`=`, `[]`, …) are
 * not readable text and must never become labels or search queries.
 */
export function visibleTextOf(html: string): string {
  // Complete tags → space; a trailing fragment cut mid-tag (`<h2 class="…`)
  // has no closing `>` and would otherwise leak class soup as "text".
  const withoutTags = html.replace(/<[^>]*>/g, " ").replace(/<[^>]*$/g, " ");
  const collapsed = withoutTags.replace(/\s+/g, " ").trim();
  // Unescape the common entities axe emits so the label reads as rendered.
  const decoded = collapsed
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Markup/selector soup is never visible text.
  if (/[=<>[\]{}]/.test(decoded)) return "";
  return decoded.length > ELEMENT_LABEL_TEXT_MAX_LENGTH
    ? `${decoded.slice(0, ELEMENT_LABEL_TEXT_MAX_LENGTH - 1)}\u2026`
    : decoded;
}

/**
 * First naming attribute (`alt`, `aria-label`, `value`, `title`,
 * `placeholder`). Tolerates snippets truncated mid-tag (no closing `>`).
 */
export function namingAttributeOf(html: string): string {
  const openingTag = html.match(/^<[^>]*/)?.[0] ?? "";
  for (const attribute of [
    "alt",
    "aria-label",
    "value",
    "title",
    "placeholder",
  ]) {
    const match = new RegExp(
      `${attribute}\\s*=\\s*["']([^"']{1,80})["']`,
      "i",
    ).exec(openingTag);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return "";
}
