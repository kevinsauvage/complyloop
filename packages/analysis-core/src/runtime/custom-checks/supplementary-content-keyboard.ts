import type { Page } from "playwright";
import type { CustomViolation } from "./types.ts";

interface SupplementaryHit {
  html: string;
  selector: string;
}

export async function supplementaryContentKeyboardViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate((): SupplementaryHit[] => {
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

    const violations: SupplementaryHit[] = [];

    for (const el of document.querySelectorAll("[title]")) {
      if (!isFocusable(el)) continue;
      const title = (el.getAttribute("title") ?? "").trim();
      if (title.length < 4) continue;
      if (el.getAttribute("aria-describedby")) continue;
      if (el.hasAttribute("aria-expanded")) continue;

      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      violations.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      });
      if (violations.length >= 5) return violations;
    }

    for (const el of document.querySelectorAll("[aria-haspopup='true']")) {
      if (!isFocusable(el)) continue;
      if (el.getAttribute("aria-expanded") === "true") continue;
      const controls = el.getAttribute("aria-controls");
      if (!controls) continue;
      const panel = document.getElementById(controls);
      if (!panel) continue;
      const style = getComputedStyle(panel);
      const hidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0";
      if (!hidden) continue;

      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      violations.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      });
      if (violations.length >= 5) return violations;
    }

    return violations;
  });

  if (nodes.length === 0) return null;

  return {
    id: "complyloop-supplementary-content-keyboard",
    impact: "moderate",
    description:
      "Supplementary content appears available only through pointer hover or hidden popups.",
    help: "Supplementary content on hover or focus must be keyboard reachable and operable (RGAA 12.11 / WCAG 2.1.1).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
