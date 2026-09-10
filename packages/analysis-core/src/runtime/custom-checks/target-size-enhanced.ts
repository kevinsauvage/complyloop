import type { Page } from "playwright";

import { TARGET_SIZE_ENHANCED_MIN_PX } from "../viewport-conditions.ts";
import { type CapturedHit } from "./hit-capture.ts";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import { ENHANCED_TARGET_CONTROL_SELECTOR } from "./interactive-control-selectors.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

type TargetHit = CapturedHit & {
  failureSummary: string;
};

/**
 * WCAG 2.5.5 Target Size (Enhanced) — 44×44 CSS pixels.
 * Does not replace axe `target-size` (24×24 / 2.5.8 AA).
 */
export async function targetSizeEnhancedViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const minSize = TARGET_SIZE_ENHANCED_MIN_PX;
  const hits = await pageEvaluateWithHitCapture(
    page,
    (captureHit, { selector, minPx }) => {
      function isInlineInText(el: HTMLElement): boolean {
        const display = getComputedStyle(el).display;
        if (display !== "inline") return false;
        const parent = el.parentElement;
        if (!parent) return false;
        return (parent.textContent ?? "").trim().length > (el.textContent ?? "").trim().length;
      }

      const found: TargetHit[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      )) {
        if (!el.isConnected) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (isInlineInText(el)) continue;
        if (rect.width >= minPx && rect.height >= minPx) continue;

        const captured = captureHit(el);
        found.push({
          ...captured,
          failureSummary: `Target is ${Math.round(rect.width)}×${Math.round(rect.height)} CSS pixels (needs ${minPx}×${minPx}).`,
        });
        if (found.length >= 5) break;
      }
      return found;
    },
    {
      selector: ENHANCED_TARGET_CONTROL_SELECTOR,
      minPx: minSize,
    },
  );

  if (hits.length === 0) return null;
  return {
    id: "target-size-enhanced",
    impact: "moderate",
    description:
      "An interactive target is smaller than 44×44 CSS pixels (WCAG 2.5.5 Target Size Enhanced).",
    help: "Enlarge the clickable area to at least 44×44 CSS pixels. This is AAA and does not replace the 24×24 AA minimum.",
    nodes: hits.map((hit) => ({
      html: hit.html,
      target: [selectorOf(hit)],
      failureSummary: hit.failureSummary,
    })),
  };
}
