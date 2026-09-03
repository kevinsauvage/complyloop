import type { Page } from "playwright";
import { isTwoDimensionalLayout } from "./reflow-exceptions.js";
import type { CustomViolation } from "./types.js";

const REFLOW_WIDTH = 320;
const REFLOW_HEIGHT = 568;
const TWO_D_LAYOUT_SOURCE = isTwoDimensionalLayout.toString();

export async function reflowViolation(page: Page): Promise<CustomViolation | null> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ width: REFLOW_WIDTH, height: REFLOW_HEIGHT });
    const hit = await page.evaluate((twoDSrc) => {
      const isTwoD = new Function(`return (${twoDSrc})`)() as typeof isTwoDimensionalLayout;

      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

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

      const html = wide.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(wide),
      };
    }, TWO_D_LAYOUT_SOURCE);

    if (!hit) return null;
    return {
      id: "complyloop-reflow",
      impact: "serious",
      description:
        "Page content requires horizontal scrolling at 320 CSS pixels without a qualifying exception.",
      help: "Content must reflow without two-dimensional scrolling except for data tables, maps, and similar 2D content (WCAG 1.4.10).",
      nodes: [{ html: hit.html, target: [hit.selector] }],
    };
  } finally {
    if (original) {
      await page.setViewportSize(original);
    }
  }
}
