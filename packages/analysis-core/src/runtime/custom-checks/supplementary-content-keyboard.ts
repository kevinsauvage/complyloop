import type { Page } from "playwright-core";

import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import { toViolationNodes } from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { isKeyboardFocusable } from "./widget-keyboard-utils.ts";

const BROWSER_HELPERS = `(function helperSource() {
  const hit = (${BROWSER_HIT_CAPTURE_SRC});
  const isKeyboardFocusable = (${isKeyboardFocusable.toString()});
  return { captureHit: hit.captureHit, isKeyboardFocusable };
})()`;

export async function supplementaryContentKeyboardViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const result = await page.evaluate((helperSrc) => {
    const { captureHit, isKeyboardFocusable } = new Function(
      `return (${helperSrc})`,
    )() as {
      captureHit: (el: Element) => CapturedHit;
      isKeyboardFocusable: (el: Element) => boolean;
    };

    const violations: CapturedHit[] = [];

    // Diagnostic counts: a pure-markup predicate must see the same DOM on
    // every stack, so the counts below distinguish "different DOM" from
    // "different verdict" when runs disagree.
    const titled = Array.from(document.querySelectorAll("[title]"));
    let focusableTitled = 0;
    for (const cand of titled) {
      if (!isKeyboardFocusable(cand)) continue;
      if ((cand.getAttribute("title") ?? "").trim().length < 4) continue;
      focusableTitled++;
    }

    let capped = false;
    for (const el of titled) {
      if (!isKeyboardFocusable(el)) continue;
      const title = (el.getAttribute("title") ?? "").trim();
      if (title.length < 4) continue;
      if (el.getAttribute("aria-describedby")) continue;
      if (el.hasAttribute("aria-expanded")) continue;

      violations.push(captureHit(el));
      if (violations.length >= 5) {
        capped = true;
        break;
      }
    }

    if (!capped) {
      for (const el of document.querySelectorAll("[aria-haspopup='true']")) {
        if (!isKeyboardFocusable(el)) continue;
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

        violations.push(captureHit(el));
        if (violations.length >= 5) break;
      }
    }

    return {
      violations,
      titleCount: titled.length,
      focusableTitled,
    };
  }, BROWSER_HELPERS);

  console.info(
    `[diag] supplementary titles=${result.titleCount} focusable-long=${result.focusableTitled}`,
  );
  const nodes = result.violations;
  if (nodes.length === 0) return null;

  return {
    id: "supplementary-content-keyboard",
    impact: "moderate",
    description:
      "Supplementary content appears available only through pointer hover or hidden popups.",
    help: "Supplementary content on hover or focus must be keyboard reachable and operable (RGAA 12.11 / WCAG 2.1.1).",
    nodes: toViolationNodes(nodes),
  };
}
