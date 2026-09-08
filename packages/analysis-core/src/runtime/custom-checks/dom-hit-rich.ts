/**
 * Leaf browser helpers for rich hit capture — no imports, close over nothing.
 * Stringified into {@link BROWSER_HIT_CAPTURE_SRC}; Vite SSR must not rewrite them.
 */

export function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Implicit or explicit role label for human-facing element identity. */
export function roleLabel(element: HTMLElement): string {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === "a" && element.hasAttribute("href")) return "link";
  if (tag === "button") return "button";
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (type === "submit" || type === "button") return "button";
    return "input";
  }
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  return tag;
}

export function accessibleNameOf(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter((part) => part.length > 0);
    if (parts.length > 0) return parts.join(" ");
  }

  const text = (element.innerText || element.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 0 && text.length <= 80) return text;
  if (text.length > 80) return `${text.slice(0, 77)}…`;

  const title = element.getAttribute("title")?.trim();
  if (title) return title;

  const alt = element.getAttribute("alt")?.trim();
  if (alt) return alt;

  const href = element.getAttribute("href")?.trim();
  if (href && element.tagName.toLowerCase() === "a") return href;

  return "";
}

/** Stable CSS-path locator (id / testid / path with nth-of-type). */
export function buildCssSelector(element: Element): string {
  if (element.id) {
    return `#${element.id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")}`;
  }

  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${escapeAttr(testId)}"]`;
  }

  const segments: string[] = [];
  let current: Element | null = element;
  const maxDepth = 6;

  while (current && current.nodeType === 1 && segments.length < maxDepth) {
    const tag = current.tagName.toLowerCase();
    let segment = tag;

    if (current === element) {
      const href = current.getAttribute("href");
      if (tag === "a" && href) {
        segment += `[href="${escapeAttr(href)}"]`;
        segments.unshift(segment);
        break;
      }
      const name = current.getAttribute("name");
      if (name) segment += `[name="${escapeAttr(name)}"]`;
      const aria = current.getAttribute("aria-label");
      if (aria) segment += `[aria-label="${escapeAttr(aria)}"]`;
    }

    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (child): child is Element =>
          child instanceof Element && child.tagName === current!.tagName,
      );
      if (sameTag.length > 1) {
        segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
    }

    segments.unshift(segment);
    if (segment.includes("[href=") || segment.includes("[data-testid=")) {
      break;
    }
    current = parent;
  }

  return segments.join(" > ");
}

export function describeObscurer(
  element: Element,
  x: number,
  y: number,
  corner: string,
): string | undefined {
  const top = document.elementFromPoint(x, y);
  if (!top || top === element || element.contains(top) || top.contains(element)) {
    return undefined;
  }
  const tag = top.tagName.toLowerCase();
  const id = top.id ? `#${top.id}` : "";
  const classes = top.classList.length
    ? `.${Array.from(top.classList).slice(0, 2).join(".")}`
    : "";
  return `Covered by \`${tag}${id}${classes}\` at the ${corner} of the focus ring`;
}
