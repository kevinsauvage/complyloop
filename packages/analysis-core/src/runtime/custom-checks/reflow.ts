import type { Page } from "playwright-core";

import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

export const REFLOW_VIEWPORT = { width: 320, height: 568 } as const;

/**
 * WCAG 1.4.10 two-dimensional layout exceptions. Horizontal scrolling is
 * legitimate for tables, maps, diagrams, video, and similar content.
 */
export function isTwoDimensionalLayout(
  tagName: string,
  role: string | null,
): boolean {
  const tags = [
    "table",
    "img",
    "svg",
    "canvas",
    "video",
    "iframe",
    "pre",
    "map",
  ];
  const roles = ["grid", "treegrid", "img", "application"];
  if (tags.includes(tagName.toLowerCase())) return true;
  return role !== null && roles.includes(role);
}

const TWO_D_LAYOUT_SOURCE = isTwoDimensionalLayout.toString();

export async function reflowViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize(REFLOW_VIEWPORT);
    const hit = await pageEvaluateWithHitCapture(
      page,
      (captureHit, { twoDSrc }) => {
        const isTwoD = new Function(
          `return (${twoDSrc})`,
        )() as typeof isTwoDimensionalLayout;

        function isExempt(el: Element): boolean {
          let current: Element | null = el;
          while (current) {
            if (isTwoD(current.tagName, current.getAttribute("role")))
              return true;
            if (current instanceof HTMLElement) {
              const style = getComputedStyle(current);
              if (style.overflowX === "auto" || style.overflowX === "scroll") {
                return true;
              }
            }
            current = current.parentElement;
          }
          return false;
        }

        const root = document.documentElement;
        const overflow =
          root.scrollWidth > root.clientWidth + 1 ||
          document.body.scrollWidth > document.body.clientWidth + 1;
        if (!overflow) return null;

        // Candidate-first: rect reads share one layout, while the exemption
        // walk calls getComputedStyle per ancestor (forced style recalc each
        // time). Only ancestors of over-wide elements pay for that walk —
        // same first-wide-non-exempt result, far fewer style reads.
        const limit = root.clientWidth + 1;
        let wide: HTMLElement | null = null;
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (!(el instanceof HTMLElement)) continue;
          if (el.getBoundingClientRect().width <= limit) continue;
          if (!isExempt(el)) {
            wide = el;
            break;
          }
        }

        if (!wide) return null;
        return captureHit(wide);
      },
      {
        twoDSrc: TWO_D_LAYOUT_SOURCE,
      },
    );

    if (!hit) return null;
    return {
      id: "reflow",
      impact: "serious",
      description:
        "Page content requires horizontal scrolling at 320 CSS pixels without a qualifying exception.",
      help: "Content must reflow without two-dimensional scrolling except for data tables, maps, and similar 2D content (WCAG 1.4.10).",
      nodes: [{ html: hit.html, target: [selectorOf(hit)] }],
    };
  } finally {
    if (original) {
      await page.setViewportSize(original);
    }
  }
}
