import type { Page } from "playwright";
import type { CustomViolation } from "./types";

const REFLOW_WIDTH = 320;
const REFLOW_HEIGHT = 568;

export async function reflowViolation(page: Page): Promise<CustomViolation | null> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ width: REFLOW_WIDTH, height: REFLOW_HEIGHT });
    const hit = await page.evaluate(() => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      const root = document.documentElement;
      const overflow =
        root.scrollWidth > root.clientWidth + 1 ||
        document.body.scrollWidth > document.body.clientWidth + 1;
      if (!overflow) return null;

      const wide = Array.from(document.querySelectorAll("body *")).find((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = getComputedStyle(el);
        if (style.overflowX === "auto" || style.overflowX === "scroll") {
          return false;
        }
        if (el.closest("table, [role='grid'], [role='treegrid']")) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > root.clientWidth + 1;
      });

      const target = wide ?? root;
      const html = target.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(target),
      };
    });

    if (!hit) return null;
    return {
      id: "complyloop-reflow",
      impact: "serious",
      description:
        "Page content requires horizontal scrolling at 320 CSS pixels without a qualifying exception.",
      help: "Content must reflow without two-dimensional scrolling except for data tables and maps (WCAG 1.4.10).",
      nodes: [{ html: hit.html, target: [hit.selector] }],
    };
  } finally {
    if (original) {
      await page.setViewportSize(original);
    }
  }
}
