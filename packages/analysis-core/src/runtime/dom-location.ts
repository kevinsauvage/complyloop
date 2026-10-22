/**
 * Shared `dom`-location primitives for the runtime engines (axe, Playwright
 * probes, html-validate); whitespace and truncation behavior must match across
 * engines so findings render the same snippet shape. DELIBERATE COPY:
 * `html-validate-runtime.ts` re-inlines the 197/200 truncation (see
 * {@link HTML_SNIPPET_TRUNCATE_LENGTH}) because it is injected as serialized
 * source and cannot import — keep those literals identical to {@link htmlSnippet}.
 */

/** Chars kept before appending `…` when a snippet exceeds {@link HTML_SNIPPET_MAX_LENGTH}. */
export const HTML_SNIPPET_TRUNCATE_LENGTH = 197;

/** Max snippet length including the ellipsis character. */
export const HTML_SNIPPET_MAX_LENGTH = 200;

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Collapses whitespace and truncates HTML to ≤200 chars. Uses numeric literals
 * (not the exported consts) so `.toString()` stays self-contained for Playwright
 * injection — keep in sync with {@link collapseWhitespace} and the 197/200 consts.
 */
export function htmlSnippet(html: string): string {
  const trimmed = html.replace(/\s+/g, " ").trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

/** Dedupe-key form: collapsed whitespace + lowercase (not truncated). */
export function normalizeSnippetKey(text: string): string {
  return collapseWhitespace(text).toLowerCase();
}

export function selectorFromTarget(target: readonly string[]): string {
  const first = target[0];
  return typeof first === "string" && first.length > 0 ? first : "(unknown)";
}

export const ELEMENT_LABEL_TEXT_MAX_LENGTH = 80;

/**
 * Human-readable label for an axe node (`h2 "Headline"`). Axe supplies only
 * `html` + `target` — no accessible name — so derive identity from the markup:
 * inner text first, then a naming attribute, else `tag (selector)`. Pure string
 * parsing, so call before {@link htmlSnippet} or the text is lost behind classes.
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
 * Visible text, tags stripped and truncated. Returns `""` when there is no real
 * text: markup soup (`=`, `[]`, …) or a snippet cut mid-tag must never become a
 * label or search query.
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

/** First naming attribute (`alt`, `aria-label`, …); tolerates snippets truncated mid-tag. */
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
