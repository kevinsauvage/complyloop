import type { Page } from "playwright";
import { isTwoDimensionalLayout } from "./reflow-exceptions.ts";
import { REFLOW_VIEWPORT } from "./reflow-math.ts";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const TWO_D_LAYOUT_SOURCE = isTwoDimensionalLayout.toString();

export async function reflowViolation(page: Page): Promise<CustomViolation | null> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize(REFLOW_VIEWPORT);
    const hit = await page.evaluate(
      ({ twoDSrc, hitCaptureSrc }) => {
        const isTwoD = new Function(`return (${twoDSrc})`)() as typeof isTwoDimensionalLayout;
        const { captureHit } = new Function(`return (${hitCaptureSrc})`)() as {
          captureHit: (el: Element) => CapturedHit;
        };

        function isExempt(el: Element): boolean {
          let current: Element | null = el;
          while (current) {
            if (isTwoD(current.tagName, current.getAttribute("role"))) return true;
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

        const wide = Array.from(document.querySelectorAll("body *")).find((el) => {
          if (!(el instanceof HTMLElement)) return false;
          if (isExempt(el)) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > root.clientWidth + 1;
        });

        if (!wide) return null;
        return captureHit(wide);
      },
      {
        twoDSrc: TWO_D_LAYOUT_SOURCE,
        hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
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
