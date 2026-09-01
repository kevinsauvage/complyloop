import type { Page } from "playwright";
import type { CustomViolation } from "./types";

export async function infoNotColorOnlyViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function usesColorOnlyIndicator(el: HTMLElement): boolean {
      const style = getComputedStyle(el);
      const hasBorderColor =
        style.borderColor !== "" &&
        style.borderColor !== "rgba(0, 0, 0, 0)" &&
        parseFloat(style.borderWidth) > 0;
      const hasTextDecoration =
        style.textDecorationLine.includes("underline") ||
        style.textDecorationLine.includes("line-through");
      const hasIcon = el.querySelector("svg, img, [role='img']") !== null;
      const hasPattern =
        el.getAttribute("aria-invalid") === "true" ||
        el.className.includes("error") ||
        el.className.includes("invalid");
      const colorSignals =
        style.color !== "" ||
        style.backgroundColor !== "" ||
        hasBorderColor;
      const nonColorCue = hasTextDecoration || hasIcon || el.textContent?.includes("*");
      return hasPattern && colorSignals && !nonColorCue;
    }

    const hits: Array<{ html: string; selector: string }> = [];
    const candidates = document.querySelectorAll(
      "[aria-invalid='true'], [aria-required='true'], .error, .invalid, [data-error]",
    );

    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      if (!usesColorOnlyIndicator(el)) continue;
      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      hits.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      });
      if (hits.length >= 5) break;
    }

    return hits;
  });

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-info-not-color-only",
    impact: "moderate",
    description:
      "Required or invalid fields may rely on color alone without a second visual cue.",
    help: "Pair color with text, icons, or patterns so status is not conveyed by color only (WCAG 1.4.1 / RGAA 3.1).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
