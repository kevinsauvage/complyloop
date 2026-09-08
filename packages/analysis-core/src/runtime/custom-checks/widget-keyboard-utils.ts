export type SelectorRef = {
  id: string;
  role: string | null;
  tagName: string;
};

/** Builds a short CSS-ish locator from a DOM element or a plain ref from `page.evaluate`. */
export function selectorOf(el: Element | SelectorRef): string {
  const id = el.id;
  const role = isElement(el) ? el.getAttribute("role") : el.role;
  if (id) return `#${id}`;
  if (role) return `[role="${role}"]`;
  return el.tagName.toLowerCase();
}

function isElement(el: Element | SelectorRef): el is Element {
  return typeof (el as Element).getAttribute === "function";
}

/** Snapshot fields to return from `page.evaluate` (then call {@link selectorOf} in Node). */
export function selectorRef(el: Element): SelectorRef {
  return { id: el.id, role: el.getAttribute("role"), tagName: el.tagName };
}

export function isKeyboardFocusable(el: Element): boolean {
  const tabindex = el.getAttribute("tabindex");
  // tabindex="-1" removes keyboard focus even on native interactive elements.
  if (tabindex !== null && parseInt(tabindex, 10) < 0) return false;
  const tag = el.tagName;
  const native =
    tag === "BUTTON" ||
    tag === "SUMMARY" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    (tag === "INPUT" && el.getAttribute("type") !== "hidden") ||
    (tag === "A" && Boolean(el.getAttribute("href")));
  if (native) return true;
  return tabindex !== null && parseInt(tabindex, 10) >= 0;
}
