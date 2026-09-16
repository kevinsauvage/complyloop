import type { Page } from "playwright-core";

import { type CapturedHit } from "./hit-capture.ts";
import {
  pageEvaluateWithHitCapture,
  toViolationNodes,
} from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { isVisuallyHiddenByDesign } from "./visually-hidden.ts";

const SPACING_STYLE_ID = "complyloop-text-spacing-test";
const IS_HIDDEN_SOURCE = isVisuallyHiddenByDesign.toString();

export async function textSpacingRuntimeViolation(
  page: Page,
): Promise<CustomViolation | null> {
    const nodes = await pageEvaluateWithHitCapture(
      page,
      (captureHit, { styleId, hiddenSrc }) => {
        const isHidden = new Function(
          `return (${hiddenSrc})`,
        )() as typeof isVisuallyHiddenByDesign;
      const existing = document.getElementById(styleId);
      existing?.remove();

      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
      * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      p, li, dd, dt {
        margin-bottom: 2em !important;
      }
    `;
      document.head.appendChild(style);

      const violations: CapturedHit[] = [];
      const candidates = document.querySelectorAll(
        "p, li, label, button, a, input, textarea",
      );

      for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        // Skip links and other sr-only content clip by design; flagging
        // their 1px box as "clipped text" is noise, not a violation.
        if (isHidden(el)) continue;
        const computed = getComputedStyle(el);
        if (computed.display === "none" || computed.visibility === "hidden")
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const clipped =
          (el.scrollHeight > el.clientHeight + 2 ||
            el.scrollWidth > el.clientWidth + 2) &&
          (computed.overflow === "hidden" ||
            computed.overflowY === "hidden" ||
            computed.textOverflow === "ellipsis");
        if (!clipped) continue;

        violations.push(captureHit(el));
        if (violations.length >= 5) break;
      }

      document.getElementById(styleId)?.remove();
      return violations;
    },
      { styleId: SPACING_STYLE_ID, hiddenSrc: IS_HIDDEN_SOURCE },
    );

  if (nodes.length === 0) return null;
  return {
    id: "text-spacing-runtime",
    impact: "serious",
    description:
      "Text is clipped or hidden when WCAG 1.4.12 text-spacing overrides are applied.",
    help: "Do not lock spacing with overflow:hidden or fixed heights that clip content when users increase spacing.",
    nodes: toViolationNodes(nodes),
  };
}
