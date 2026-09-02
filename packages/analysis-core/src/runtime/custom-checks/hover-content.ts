import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

export async function hoverContentViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function isFocusable(el: Element): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.matches('[tabindex="-1"]')) return false;
      if (el.matches("a[href], button, input, select, textarea")) return true;
      const tabIndex = el.getAttribute("tabindex");
      return tabIndex !== null && tabIndex !== "-1";
    }

    const violations: Array<{ html: string; selector: string }> = [];

    for (const el of document.querySelectorAll("[aria-describedby]")) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isFocusable(el)) continue;
      const ids = (el.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean);
      for (const id of ids) {
        const described = document.getElementById(id);
        if (!described) continue;
        const style = getComputedStyle(described);
        const hidden =
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0";
        if (!hidden) continue;
        if (el.getAttribute("aria-expanded") === "true") continue;

        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(el),
        });
        break;
      }
      if (violations.length >= 5) break;
    }

    return violations;
  });

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-hover-content",
    impact: "moderate",
    description:
      "Supplementary content linked with aria-describedby is hidden and may only appear on hover.",
    help: "Hover or focus content must be dismissable, hoverable, and reachable by keyboard (WCAG 1.4.13).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
