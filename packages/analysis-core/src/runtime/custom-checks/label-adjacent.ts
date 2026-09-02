import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

const MAX_LABEL_GAP_PX = 48;

export async function labelAdjacentViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate((maxGap) => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function gapBetween(a: DOMRect, b: DOMRect): number {
      const horizontal =
        a.right < b.left
          ? b.left - a.right
          : b.right < a.left
            ? a.left - b.right
            : 0;
      const vertical =
        a.bottom < b.top
          ? b.top - a.bottom
          : b.bottom < a.top
            ? a.top - b.bottom
            : 0;
      return Math.max(horizontal, vertical);
    }

    const violations: Array<{ html: string; selector: string }> = [];
    const fields = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea',
    );

    for (const field of fields) {
      if (!(field instanceof HTMLElement)) continue;
      if (!field.id) continue;
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (!label) continue;
      if (label.contains(field)) continue;

      const fieldRect = field.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      if (fieldRect.width === 0 || labelRect.width === 0) continue;

      if (gapBetween(fieldRect, labelRect) <= maxGap) continue;

      const html = field.outerHTML.replace(/\s+/g, " ").trim();
      violations.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(field),
      });
      if (violations.length >= 5) break;
    }

    return violations;
  }, MAX_LABEL_GAP_PX);

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-label-adjacent",
    impact: "moderate",
    description:
      "Visible label is programmatically associated but not visually adjacent to its field.",
    help: "Place the label next to the control it names so sighted users can match them (WCAG 3.3.2 / RGAA 11.4).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
