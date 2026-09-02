import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

const DEPRECATED_TAGS = new Set([
  "font",
  "center",
  "marquee",
  "blink",
  "basefont",
  "big",
  "strike",
  "tt",
]);

const PRESENTATION_ATTRS = [
  "align",
  "bgcolor",
  "background",
  "alink",
  "link",
  "vlink",
  "text",
  "face",
] as const;

export async function cssForPresentationViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const hits = await page.evaluate(
    ({ deprecatedTags, presentationAttrs }) => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      function hasPresentationAttr(el: Element): boolean {
        for (const name of presentationAttrs) {
          if (el.hasAttribute(name)) return true;
        }
        const border = el.getAttribute("border");
        if (border !== null && el.tagName !== "IMG" && el.tagName !== "IFRAME") {
          return true;
        }
        return false;
      }

      const results: Array<{ html: string; selector: string }> = [];
      for (const el of document.querySelectorAll("body *")) {
        const tag = el.tagName.toLowerCase();
        if (!deprecatedTags.includes(tag) && !hasPresentationAttr(el)) continue;
        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        results.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(el),
        });
        if (results.length >= 5) break;
      }
      return results;
    },
    {
      deprecatedTags: [...DEPRECATED_TAGS],
      presentationAttrs: [...PRESENTATION_ATTRS],
    },
  );

  if (hits.length === 0) return [];

  return [
    {
      id: "complyloop-css-for-presentation",
      impact: "moderate",
      description:
        "Deprecated presentational markup or attributes control layout instead of stylesheets.",
      help: "Replace <font>, <center>, align, bgcolor, and similar attributes with CSS (WCAG 1.3.1 / RGAA 10.1).",
      nodes: hits.map((hit) => ({ html: hit.html, target: [hit.selector] })),
    },
  ];
}
