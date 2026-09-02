import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

export async function nonTextContrastViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      return role ? `${tag}[role="${role}"]` : tag;
    }

    function parseRgb(value: string): [number, number, number] | null {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    function luminance([r, g, b]: [number, number, number]): number {
      const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    function contrast(a: [number, number, number], b: [number, number, number]): number {
      const l1 = luminance(a);
      const l2 = luminance(b);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function backgroundRgb(el: Element): [number, number, number] | null {
      let current: Element | null = el;
      while (current) {
        const bg = parseRgb(getComputedStyle(current).backgroundColor);
        if (bg && getComputedStyle(current).backgroundColor !== "rgba(0, 0, 0, 0)") {
          return bg;
        }
        current = current.parentElement;
      }
      return parseRgb(getComputedStyle(document.body).backgroundColor);
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
      const border = parseRgb(style.borderTopColor);
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
  });

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-non-text-contrast",
    impact: "serious",
    description:
      "UI control border does not meet 3:1 contrast against its background (WCAG 1.4.11).",
    help: "Increase border contrast for buttons, inputs, and other controls so boundaries are visible.",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
