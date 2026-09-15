import type { Page } from "playwright-core";

import { type CapturedHit } from "./hit-capture.ts";
import {
  pageEvaluateWithHitCapture,
  toViolationNodes,
} from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";

/** Maximum pixel gap between associated label and field before review. */
export const MAX_LABEL_GAP_PX = 48;

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width?: number;
  height?: number;
}

/** Shortest edge-to-edge distance between two bounding boxes. */
export function gapBetweenRects(a: RectLike, b: RectLike): number {
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

export async function labelAdjacentViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const gapSource = gapBetweenRects.toString();
  const nodes = await pageEvaluateWithHitCapture(
    page,
    (captureHit, { maxGap, gapFnSource }) => {
      const gapBetween = new Function(
        "a",
        "b",
        `const gapBetweenRects = (${gapFnSource}); return gapBetweenRects(a, b);`,
      ) as (a: DOMRect, b: DOMRect) => number;

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
        const label = document.querySelector(
          `label[for="${CSS.escape(field.id)}"]`,
        );
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
    },
  );

  if (nodes.length === 0) return null;
  return {
    id: "label-adjacent",
    impact: "moderate",
    description:
      "Visible label is programmatically associated but may not be visually adjacent to its field.",
    help: "Place the label next to the control it names so sighted users can match them (WCAG 3.3.2 / RGAA 11.4).",
    nodes: toViolationNodes(nodes),
  };
}
