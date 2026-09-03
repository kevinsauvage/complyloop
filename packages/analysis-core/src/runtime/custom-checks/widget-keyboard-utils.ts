export function selectorOf(el: Element): string {
  if (el.id) return `#${el.id}`;
  const role = el.getAttribute("role");
  if (role) return `[role="${role}"]`;
  return el.tagName.toLowerCase();
}

export function isKeyboardFocusable(el: Element): boolean {
  const tag = el.tagName;
  const native =
    tag === "BUTTON" ||
    tag === "SUMMARY" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    (tag === "INPUT" && el.getAttribute("type") !== "hidden") ||
    (tag === "A" && Boolean(el.getAttribute("href")));
  if (native) return true;
  const tabindex = el.getAttribute("tabindex");
  return tabindex !== null && parseInt(tabindex, 10) >= 0;
}
