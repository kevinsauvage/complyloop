/**
 * Stable identity for deduping hits inside page.evaluate probes.
 *
 * The key doubles as the finding's `location.selector` (via `target`), which
 * is persisted as part of a JSONB payload. Postgres rejects NUL bytes in JSON
 * strings, so the separator must be a printable character — never `\0`.
 *
 * The key now includes a CSS-path-style positioning component (based on
 * nth-of-type among siblings) so that distinct DOM nodes with the same tag
 * name and role receive distinct keys. This prevents silent dedupe erasure
 * of dissenting nodes and ensures `runtimeViolationStillPresent` can match
 * the correct node.
 */
export function hitIdentityKey(el: HTMLElement): string {
  // Build a CSS-path-style position identifier for unique node identification.
  // If the element has an id, use a CSS id selector; otherwise walk up the DOM
  // building a path with nth-of-type indices for sibling duplication.
  let cssPath: string;
  if (el.id) {
    cssPath = `#${el.id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")}`;
  } else {
    const segments: string[] = [];
    let current: Element | null = el;
    const maxDepth = 6;
    for (let depth = 0; depth < maxDepth && current; depth++) {
      const tag = current.tagName.toLowerCase();
      let segment = tag;
      const parent: Element | null = current.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (child): child is Element => child.tagName === current!.tagName,
        ) as Element[];
        if (sameTag.length > 1) {
          const index = Array.from(parent.children).indexOf(current) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }
      segments.unshift(segment);
      if (segment.includes("[") || segment.startsWith("#")) {
        break;
      }
      current = parent;
    }
    cssPath = segments.join(" > ");
  }

  const role = el.getAttribute("role") ?? "";
  return `${cssPath}::${role}::${el.tagName}`;
}

/** Serializable source of {@link hitIdentityKey} for Playwright `page.evaluate`. */
export const HIT_IDENTITY_KEY_SRC = hitIdentityKey.toString();
