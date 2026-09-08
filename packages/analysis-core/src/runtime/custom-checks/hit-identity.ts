/**
 * Stable identity for deduping hits inside page.evaluate probes.
 *
 * The key doubles as the finding's `location.selector` (via `target`), which
 * is persisted as part of a JSONB payload. Postgres rejects NUL bytes in JSON
 * strings, so the separator must be a printable character — never `\0`.
 */
export function hitIdentityKey(el: {
  id: string;
  tagName: string;
  getAttribute(name: string): string | null;
}): string {
  return `${el.id}::${el.getAttribute("role") ?? ""}::${el.tagName}`;
}

/** Serializable source of {@link hitIdentityKey} for Playwright `page.evaluate`. */
export const HIT_IDENTITY_KEY_SRC = hitIdentityKey.toString();
