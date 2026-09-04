import type { Page } from "playwright";
import type { CustomViolation } from "./types.ts";

const FONT_SCALE = "200%";

export async function resizeTextViolation(
  page: Page,
): Promise<CustomViolation | null> {
  try {
    const hit = await page.evaluate((fontScale) => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      document.documentElement.style.fontSize = fontScale;

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

      if (!clipped) return null;

      const html = clipped.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(clipped),
      };
    }, FONT_SCALE);

    if (!hit) return null;
    return {
      id: "resize-text",
      impact: "serious",
      description:
        "Text is clipped after 200% text resize at the default viewport.",
      help: "Content must remain readable when text is resized to 200% without loss (WCAG 1.4.4 / RGAA 10.4). Narrow-viewport reflow is checked separately (WCAG 1.4.10).",
      nodes: [{ html: hit.html, target: [hit.selector] }],
    };
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    }).catch(() => {
      // Page may be closed or navigating; fontSize restore is best-effort.
    });
  }
}
