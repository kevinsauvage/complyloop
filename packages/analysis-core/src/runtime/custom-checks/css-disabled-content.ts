import type { Page } from "playwright";

import { type CapturedHit } from "./hit-capture.ts";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

export async function cssDisabledContentViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const hits = await pageEvaluateWithHitCapture(page, (captureHit) => {
    function hasVisibleDomText(el: Element): boolean {
      return (el.textContent ?? "").trim().length > 0;
    }

    function normalizePseudoContent(value: string): string {
      return value
        .replace(/^["']|["']$/g, "")
        .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) =>
          String.fromCodePoint(Number.parseInt(hex, 16)),
        )
        .trim();
    }

    function isSymbolicOnly(text: string): boolean {
      const compact = text.replace(/\s+/g, "");
      if (compact.length === 0) return true;
      if (compact.length === 1) return true;
      return /^[\u2190-\u21FF\u25A0-\u25FF\u2600-\u26FF→←▼▶»‹›*•·+×÷|/\\-–—:;,.!?()[\]{}]+$/u.test(
        compact,
      );
    }

    function looksLikeWords(text: string): boolean {
      return /\p{L}{2,}/u.test(text);
    }

    const results: CapturedHit[] = [];

    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      if (hasVisibleDomText(el)) continue;

      const before = getComputedStyle(el, "::before").content;
      const after = getComputedStyle(el, "::after").content;
      const pseudoText = [before, after]
        .filter((value) => value && value !== "none" && value !== '""')
        .map(normalizePseudoContent)
        .join(" ")
        .trim();
      if (pseudoText.length === 0) continue;
      if (isSymbolicOnly(pseudoText)) continue;

      const bg = getComputedStyle(el).backgroundImage;
      const hasBgImage = bg && bg !== "none";
      if (!looksLikeWords(pseudoText) && !hasBgImage) continue;

      results.push(captureHit(el));
    }

    return results;
  });

  if (hits.length === 0) return [];

  return [
    {
      id: "css-disabled-content",
      impact: "moderate",
      description:
        "Visible text may depend on CSS pseudo-elements or background images instead of HTML.",
      help: "Put essential text in the document, not only in ::before/::after content or image backgrounds (WCAG 1.3.1 / RGAA 10.2).",
      nodes: hits.map((hit) => ({ html: hit.html, target: [selectorOf(hit)] })),
    },
  ];
}
