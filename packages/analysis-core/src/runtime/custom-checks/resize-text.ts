import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

const RESIZE_WIDTH = 320;
const RESIZE_HEIGHT = 568;
const FONT_SCALE = "200%";

export async function resizeTextViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ width: RESIZE_WIDTH, height: RESIZE_HEIGHT });
    const hit = await page.evaluate((fontScale) => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      document.documentElement.style.fontSize = fontScale;
      const root = document.documentElement;
      const overflow =
        root.scrollWidth > root.clientWidth + 1 ||
        document.body.scrollWidth > document.body.clientWidth + 1;
      if (!overflow) return null;

      const clipped = Array.from(document.querySelectorAll("body *")).find((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = getComputedStyle(el);
        if (style.overflowX === "auto" || style.overflowX === "scroll") {
          return false;
        }
        if (el.closest("table, [role='grid'], [role='treegrid']")) {
          return false;
        }
        const overflows =
          el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        const hidden =
          style.overflow === "hidden" ||
          style.overflowX === "hidden" ||
          style.overflowY === "hidden" ||
          style.textOverflow === "ellipsis";
        return overflows && hidden;
      });

      const target = clipped ?? root;
      const html = target.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(target),
      };
    }, FONT_SCALE);

    if (!hit) return null;
    return {
      id: "complyloop-resize-text",
      impact: "serious",
      description:
        "Text clipped or requires horizontal scrolling after 200% text resize at 320 CSS pixels.",
      help: "Content must remain readable when text is resized to 200% without loss (WCAG 1.4.4 / RGAA 10.4).",
      nodes: [{ html: hit.html, target: [hit.selector] }],
    };
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    if (original) {
      await page.setViewportSize(original);
    }
  }
}
