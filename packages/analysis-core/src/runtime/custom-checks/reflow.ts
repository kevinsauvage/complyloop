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

        // An over-wide element clipped by an ancestor (`overflow: hidden/clip`,
        // e.g. a decorative blurred circle inside a hero) cannot widen the
        // page; only unclipped ones can be the cause.
        function isClippedByAncestor(el: Element): boolean {
          let current = el.parentElement;
          while (current && current !== document.body) {
            const style = getComputedStyle(current);
            if (
              style.overflowX === "hidden" ||
              style.overflowX === "clip" ||
              style.overflowX === "auto" ||
              style.overflowX === "scroll"
            ) {
              return true;
            }
            current = current.parentElement;
          }
          return false;
        }

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
        let sawExempt = false;
        let sawClipped = false;
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (!(el instanceof HTMLElement)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= limit && rect.right <= limit && rect.left >= -1) {
            continue;
          }
          if (isClippedByAncestor(el)) {
            sawClipped = true;
            continue;
          }
          if (isExempt(el)) {
            sawExempt = true;
            continue;
          }
          wide = el;
          break;
        }

        if (wide) return captureHit(wide);
        // The page scrolls sideways, no exempt 2D content explains it, and the
        // only over-wide elements are clipped by an ancestor: something else
        // widens the page. Report the document, not an innocent clipped node.
        if (sawClipped && !sawExempt) return captureHit(root);
        return null;
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
