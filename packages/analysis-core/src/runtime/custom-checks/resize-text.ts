import type { Page } from "playwright-core";

import {
  pageEvaluateWithHitCapture,
  toViolationNodes,
} from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { isVisuallyHiddenByDesign } from "./visually-hidden.ts";

const FONT_SCALE = "200%";
const IS_HIDDEN_SOURCE = isVisuallyHiddenByDesign.toString();

export async function resizeTextViolation(
  page: Page,
): Promise<CustomViolation | null> {
  try {
    const hit = await pageEvaluateWithHitCapture(
      page,
      (captureHit, { fontScale, hiddenSrc }) => {
        const isHidden = new Function(
          `return (${hiddenSrc})`,
        )() as typeof isVisuallyHiddenByDesign;
        document.documentElement.style.fontSize = fontScale;

        // `overflow: hidden` + overflowing content is not yet lost text: cards
        // clip decorative glows and blurred backgrounds on purpose. Only text
        // that actually sits outside the clipping box counts.
        function hasClippedText(el: HTMLElement): boolean {
          const box = el.getBoundingClientRect();
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!(node.textContent ?? "").trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (
              rect.bottom > box.bottom + 1 ||
              rect.right > box.right + 1 ||
              rect.top < box.top - 1 ||
              rect.left < box.left - 1
            ) {
              return true;
            }
          }
          return false;
        }

        // A line-clamped excerpt next to a disclosure control ("Read more",
        // aria-expanded) is a progressive-disclosure pattern: the full text
        // is one activation away, so the clamp is not content loss.
        function isDisclosedExcerpt(el: HTMLElement): boolean {
          const style = getComputedStyle(el);
          const lineClamp =
            style.getPropertyValue("-webkit-line-clamp") ||
            style.getPropertyValue("line-clamp");
          if (!lineClamp || lineClamp === "none") return false;
          const container = el.parentElement;
          return Boolean(container?.querySelector("[aria-expanded]"));
        }

        const clipped = Array.from(document.querySelectorAll("body *")).find(
          (el) => {
            if (!(el instanceof HTMLElement)) return false;
            // Skip links and other sr-only content clip by design.
            if (isHidden(el)) return false;
            const style = getComputedStyle(el);
            if (style.overflowX === "auto" || style.overflowX === "scroll") {
              return false;
            }
            if (el.closest("table, [role='grid'], [role='treegrid']")) {
              return false;
            }
            const overflows =
              el.scrollWidth > el.clientWidth + 1 ||
              el.scrollHeight > el.clientHeight + 1;
            const hidden =
              style.overflow === "hidden" ||
              style.overflowX === "hidden" ||
              style.overflowY === "hidden" ||
              style.textOverflow === "ellipsis";
            if (!overflows || !hidden) return false;
            if (isDisclosedExcerpt(el)) return false;
            return hasClippedText(el);
          },
        );

        if (!clipped) return null;
        return captureHit(clipped);
      },
      { fontScale: FONT_SCALE, hiddenSrc: IS_HIDDEN_SOURCE },
    );

    if (!hit) return null;
    return {
      id: "resize-text",
      impact: "serious",
      description:
        "Text is clipped after 200% text resize at the default viewport.",
      help: "Content must remain readable when text is resized to 200% without loss (WCAG 1.4.4 / RGAA 10.4). Narrow-viewport reflow is checked separately (WCAG 1.4.10).",
      nodes: toViolationNodes([hit]),
    };
  } finally {
    await page
      .evaluate(() => {
        document.documentElement.style.fontSize = "";
      })
      .catch(() => {
        // Page may be closed or navigating; fontSize restore is best-effort.
      });
  }
}
