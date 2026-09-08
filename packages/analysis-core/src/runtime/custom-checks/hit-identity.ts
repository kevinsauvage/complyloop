/** Stable identity for deduping hits inside page.evaluate probes. */
export function hitIdentityKey(el: {
  id: string;
  tagName: string;
  getAttribute(name: string): string | null;
}): string {
  return `${el.id}\0${el.getAttribute("role") ?? ""}\0${el.tagName}`;
}

/** Serializable source of {@link hitIdentityKey} for Playwright `page.evaluate`. */
export const HIT_IDENTITY_KEY_SRC = hitIdentityKey.toString();
