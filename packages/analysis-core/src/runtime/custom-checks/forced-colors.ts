import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.js";

/**
 * Windows High Contrast / forced-colors mode strips `box-shadow`,
 * `background-image`, and gradients, and flattens author colors into a system
 * palette. An interactive control whose only presence is a `box-shadow` or a
 * `background-image` — with no border, no outline, no text, and no filled
 * background — disappears entirely under that condition.
 *
 * Detection reads the normal computed styles and treats box-shadow /
 * background-image as non-boundaries (both are removed in forced-colors),
 * matching how the other custom checks work (spec-grounded heuristic rather
 * than live emulation). Returns a `complyloop-forced-colors` violation mapped
 * to the `non-text-contrast` check.
 */
export async function forcedColorsViolation(
  page: Page,
): Promise<CustomViolation | null> {
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
      return (
        color === "transparent" ||
        color === "rgba(0, 0, 0, 0)" ||
        color === ""
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
      const noBorder =
        style.borderStyle === "none" || parseFloat(style.borderWidth) === 0;
      const noOutline =
        style.outlineStyle === "none" || parseFloat(style.outlineWidth) === 0;
      if (!noBorder || !noOutline) continue;

      const textless = !(el.textContent ?? "").trim();
      if (!textless) continue;
      if (!isTransparent(style.backgroundColor)) continue;

      const hasDecoration =
        (style.boxShadow !== "none" && style.boxShadow !== "") ||
        (style.backgroundImage !== "none" && style.backgroundImage !== "");
      if (!hasDecoration) continue;

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
          "Control has no text, border, outline, or filled background — its only presence is box-shadow or background-image, both of which Windows High Contrast / forced-colors mode removes.",
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
      "An interactive control relies only on box-shadow or background-image for its presence, so Windows High Contrast / forced-colors mode renders it invisible — it has no text, border, outline, or filled background to fall back on.",
    help: "Interactive controls must keep a visible, non-decoration-only boundary under forced-colors mode (WCAG 1.4.11).",
    nodes,
  };
}