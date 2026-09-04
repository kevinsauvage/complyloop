import type { Page } from "playwright";
import type { CustomViolation } from "./types.ts";

export async function mediaIdentificationViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function hasAccessibleName(el: Element): boolean {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.trim().length > 0) return true;
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        for (const id of labelledBy.split(/\s+/)) {
          const target = document.getElementById(id);
          if (target && (target.textContent ?? "").trim().length > 0) return true;
        }
      }
      if (el instanceof HTMLEmbedElement) {
        const title = el.getAttribute("title");
        if (title && title.trim().length > 0) return true;
      }
      return false;
    }

    function hasAdjacentAlternative(el: Element): boolean {
      const next = el.nextElementSibling;
      if (!next) return false;
      if (next.matches("a[href], button")) {
        return (next.textContent ?? "").trim().length > 0;
      }
      return false;
    }

    const violations: Array<{ html: string; selector: string }> = [];
    for (const el of document.querySelectorAll("embed, canvas")) {
      if (el.getAttribute("role") === "presentation") continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (hasAccessibleName(el) || hasAdjacentAlternative(el)) continue;

      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      violations.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      });
      if (violations.length >= 5) break;
    }

    return violations;
  });

  if (nodes.length === 0) return null;

  return {
    id: "complyloop-media-identification",
    impact: "serious",
    description:
      "Non-temporal media is not clearly identified and lacks an accessible alternative.",
    help: "Identify embed and canvas media and provide a text alternative (RGAA 4.7).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
