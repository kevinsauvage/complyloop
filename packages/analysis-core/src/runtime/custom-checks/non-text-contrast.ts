import type { Page } from "playwright";
import { contrastRatio, parseRgb, relativeLuminance } from "./non-text-contrast-math.js";
import type { CustomViolation } from "./types.js";

export async function nonTextContrastViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const parseRgbSource = parseRgb.toString();
  const luminanceSource = relativeLuminance.toString();
  const contrastSource = contrastRatio.toString();

  const nodes = await page.evaluate(
    ({ parseRgbSrc, luminanceSrc, contrastSrc }) => {
      const parseColor = new Function(
        "value",
        `${parseRgbSrc}; return parseRgb(value);`,
      ) as (value: string) => [number, number, number] | null;
      const contrast = new Function(
        "a",
        "b",
        `${luminanceSrc}; ${contrastSrc}; return contrastRatio(a, b);`,
      ) as (
        a: [number, number, number],
        b: [number, number, number],
      ) => number;

      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        return role ? `${tag}[role="${role}"]` : tag;
      }

      function backgroundRgb(el: Element): [number, number, number] | null {
        let current: Element | null = el;
        while (current) {
          const bg = parseColor(getComputedStyle(current).backgroundColor);
          if (bg && getComputedStyle(current).backgroundColor !== "rgba(0, 0, 0, 0)") {
            return bg;
          }
          current = current.parentElement;
        }
        return parseColor(getComputedStyle(document.body).backgroundColor);
      }

      const violations: Array<{ html: string; selector: string }> = [];
      const controls = document.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="checkbox"], [role="radio"]',
      );

      for (const el of controls) {
        if (!(el instanceof HTMLElement)) continue;
        const style = getComputedStyle(el);
        const borderWidth = parseFloat(style.borderTopWidth);
        if (borderWidth <= 0) continue;
        const border = parseColor(style.borderTopColor);
        const bg = backgroundRgb(el);
        if (!border || !bg) continue;
        if (contrast(border, bg) >= 3) continue;

        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(el),
        });
        if (violations.length >= 5) break;
      }

      return violations;
    },
    { parseRgbSrc: parseRgbSource, luminanceSrc: luminanceSource, contrastSrc: contrastSource },
  );

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-non-text-contrast",
    impact: "serious",
    description:
      "UI control border does not meet 3:1 contrast against its background (WCAG 1.4.11).",
    help: "Increase border or adjacent background contrast for interactive controls.",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
