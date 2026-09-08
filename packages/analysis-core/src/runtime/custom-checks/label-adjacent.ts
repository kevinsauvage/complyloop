import type { Page } from "playwright";
import {
  gapBetweenRects,
  MAX_LABEL_GAP_PX,
} from "./label-adjacent-math.ts";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

export async function labelAdjacentViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const gapSource = gapBetweenRects.toString();
  const nodes = await page.evaluate(
    ({ maxGap, gapFnSource, hitCaptureSrc }) => {
      const gapBetween = new Function(
        "a",
        "b",
        `${gapFnSource}; return gapBetweenRects(a, b);`,
      ) as (a: DOMRect, b: DOMRect) => number;
      const { captureHit } = new Function(`return (${hitCaptureSrc})`)() as {
        captureHit: (el: Element) => CapturedHit;
      };

      function skipLayout(label: Element, field: Element): boolean {
        let ancestor = label.parentElement;
        while (ancestor && ancestor !== document.documentElement) {
          const style = getComputedStyle(ancestor);
          if (
            (style.display === "flex" ||
              style.display === "grid" ||
              style.display === "inline-flex") &&
            ancestor.contains(field)
          ) {
            return true;
          }
          ancestor = ancestor.parentElement;
        }

        const labelCell = label.closest("td, th");
        const fieldCell = field.closest("td, th");
        if (
          labelCell &&
          fieldCell &&
          labelCell !== fieldCell &&
          labelCell.closest("tr") === fieldCell.closest("tr")
        ) {
          return true;
        }

        return false;
      }

      const violations: CapturedHit[] = [];
      const fields = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea',
      );

      for (const field of fields) {
        if (!(field instanceof HTMLElement)) continue;
        if (!field.id) continue;
        const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (!label) continue;
        if (label.contains(field)) continue;
        if (skipLayout(label, field)) continue;

        const fieldRect = field.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        if (fieldRect.width === 0 || labelRect.width === 0) continue;
        if (gapBetween(labelRect, fieldRect) <= maxGap) continue;

        violations.push(captureHit(field));
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      maxGap: MAX_LABEL_GAP_PX,
      gapFnSource: gapSource,
      hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
    },
  );

  if (nodes.length === 0) return null;
  return {
    id: "label-adjacent",
    impact: "moderate",
    description:
      "Visible label is programmatically associated but may not be visually adjacent to its field.",
    help: "Place the label next to the control it names so sighted users can match them (WCAG 3.3.2 / RGAA 11.4).",
    nodes: nodes.map((node) => ({ html: node.html, target: [selectorOf(node)] })),
  };
}
