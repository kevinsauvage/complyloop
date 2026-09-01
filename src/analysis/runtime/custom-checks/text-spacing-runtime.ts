import type { Page } from "playwright";
import type { CustomViolation } from "./types";

const SPACING_STYLE_ID = "complyloop-text-spacing-test";

export async function textSpacingRuntimeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate((styleId) => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    const existing = document.getElementById(styleId);
    existing?.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      p, li, dd, dt {
        margin-bottom: 2em !important;
      }
    `;
    document.head.appendChild(style);

    const violations: Array<{ html: string; selector: string }> = [];
    const candidates = document.querySelectorAll("p, li, label, button, a, input, textarea");

    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const clipped =
        (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) &&
        (style.overflow === "hidden" || style.overflowY === "hidden" || style.textOverflow === "ellipsis");
      if (!clipped) continue;

      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      violations.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      });
      if (violations.length >= 5) break;
    }

    document.getElementById(styleId)?.remove();
    return violations;
  }, SPACING_STYLE_ID);

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-text-spacing-runtime",
    impact: "serious",
    description:
      "Text is clipped or hidden when WCAG 1.4.12 text-spacing overrides are applied.",
    help: "Do not lock spacing with overflow:hidden or fixed heights that clip content when users increase spacing.",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
