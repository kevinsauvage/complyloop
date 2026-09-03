import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.js";

/**
 * Windows High Contrast / forced-colors mode strips decorative boundaries.
 * Emulates `forced-colors: active` and flags interactive controls with no
 * text, border, outline, or filled background under that condition.
 */
export async function forcedColorsViolation(
  page: Page,
): Promise<CustomViolation | null> {
  await page.emulateMedia({ forcedColors: "active" });
  try {
    const nodes = await page.evaluate(() => {
      const interactiveSelector = [
        "button",
        "[role='button']",
        "input:not([type='hidden'])",
        "select",
        "textarea",
        "[role='textbox']",
        "[role='checkbox']",
        "[role='radio']",
        "[role='switch']",
        "[role='slider']",
        "a[href]",
      ].join(",");
      const maxNodes = 10;

      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      function isVisible(el: HTMLElement): boolean {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function isTransparent(color: string): boolean {
        if (color === "transparent" || color === "") return true;
        const rgba = color.match(
          /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)$/,
        );
        if (rgba) {
          const alpha = rgba[1];
          return alpha !== undefined && parseFloat(alpha) === 0;
        }
        return false;
      }

      function hasVisibleBorder(style: CSSStyleDeclaration): boolean {
        return (
          style.borderStyle !== "none" && parseFloat(style.borderWidth) > 0
        );
      }

      function hasVisibleOutline(style: CSSStyleDeclaration): boolean {
        return (
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
        );
      }

      const found: CustomViolationNode[] = [];
      const seen = new Set<string>();

      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(interactiveSelector),
      )) {
        if (!el.isConnected) continue;
        if (!isVisible(el)) continue;

        const style = getComputedStyle(el);
        if (hasVisibleBorder(style) || hasVisibleOutline(style)) continue;

        const hasVisibleText = Boolean((el.textContent ?? "").trim());
        if (hasVisibleText) continue;
        if (!isTransparent(style.backgroundColor)) continue;

        const key = selectorOf(el);
        if (seen.has(key)) continue;
        seen.add(key);

        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        found.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          target: [key],
          elementLabel:
            el.getAttribute("aria-label") ??
            el.getAttribute("title") ??
            undefined,
          failureSummary:
            "Under forced-colors mode this control has no visible text, border, outline, or filled background.",
        });
        if (found.length >= maxNodes) break;
      }

      return found;
    });

    if (nodes.length === 0) return null;
    return {
      id: "complyloop-forced-colors",
      impact: "serious",
      description:
        "An interactive control has no visible boundary under forced-colors mode — no text, border, outline, or filled background.",
      help: "Interactive controls must remain visible under forced-colors (WCAG 1.4.11).",
      nodes,
    };
  } finally {
    await page.emulateMedia({ forcedColors: "none" });
  }
}
