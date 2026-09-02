import type { Page } from "playwright";
import type { CustomViolation } from "./types";

export async function bothColorsRuntimeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function hasInlineColor(el: HTMLElement): boolean {
      return el.style.color !== "";
    }

    function hasInlineBackground(el: HTMLElement): boolean {
      return el.style.backgroundColor !== "";
    }

    const violations: Array<{ html: string; selector: string }> = [];
    const textHosts = document.querySelectorAll("p, span, label, button, a, li, td, th");

    for (const el of textHosts) {
      if (!(el instanceof HTMLElement)) continue;
      const colorOnly = hasInlineColor(el) && !hasInlineBackground(el);
      const backgroundOnly = hasInlineBackground(el) && !hasInlineColor(el);
      if (!colorOnly && !backgroundOnly) continue;

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
    id: "complyloop-both-colors",
    impact: "moderate",
    description:
      "Element sets foreground or background color without the paired value, which breaks user stylesheets.",
    help: "Set both color and background-color on text containers (WCAG 1.4.3 / RGAA 10.5).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
