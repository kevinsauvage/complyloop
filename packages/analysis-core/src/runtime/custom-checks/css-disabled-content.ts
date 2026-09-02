import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

interface CssContentHit {
  html: string;
  selector: string;
}

export async function cssDisabledContentViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const hits = await page.evaluate((): CssContentHit[] => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function directText(el: Element): string {
      let text = "";
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent ?? "";
        }
      }
      return text.trim();
    }

    const results: CssContentHit[] = [];

    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      if (directText(el).length > 0) continue;

      const before = getComputedStyle(el, "::before").content;
      const after = getComputedStyle(el, "::after").content;
      const pseudoText = [before, after]
        .filter((value) => value && value !== "none" && value !== '""')
        .join(" ")
        .replace(/^["']|["']$/g, "")
        .trim();
      if (pseudoText.length === 0) continue;

      const bg = getComputedStyle(el).backgroundImage;
      const hasBgImage = bg && bg !== "none";
      if (!hasBgImage && pseudoText.length < 2) continue;

      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      results.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
      });
    }

    return results;
  });

  if (hits.length === 0) return [];

  return [
    {
      id: "complyloop-css-disabled-content",
      impact: "moderate",
      description:
        "Visible text may depend on CSS pseudo-elements or background images instead of HTML.",
      help: "Put essential text in the document, not only in ::before/::after content or image backgrounds (WCAG 1.3.1 / RGAA 10.2).",
      nodes: hits.map((hit) => ({ html: hit.html, target: [hit.selector] })),
    },
  ];
}
