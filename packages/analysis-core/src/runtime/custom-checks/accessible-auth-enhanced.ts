import type { Page } from "playwright";
import { AUTH_CONTEXT, PUZZLE_CAPTCHA } from "../../patterns/multilingual.ts";
import type { CustomViolation } from "./types.ts";

export async function accessibleAuthEnhancedViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(
    ({ authSource, puzzleSource }) => {
      const authPattern = new RegExp(authSource, "i");
      const puzzlePattern = new RegExp(puzzleSource, "i");

      function foldAccents(value: string): string {
        return value.normalize("NFD").replace(/\p{M}/gu, "");
      }

      function matchesPattern(pattern: RegExp, text: string): boolean {
        return pattern.test(text) || pattern.test(foldAccents(text));
      }

      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      const authContext = [
        document.title,
        ...[...document.querySelectorAll("form, main, [role='main']")].map(
          (el) => el.textContent ?? "",
        ),
      ].join(" ");
      if (!matchesPattern(authPattern, authContext)) return [];

      const violations: Array<{ html: string; selector: string }> = [];
      const candidates = [
        ...document.querySelectorAll("iframe"),
        ...document.querySelectorAll("[class*='captcha' i], [id*='captcha' i], [data-sitekey]"),
      ];

      for (const el of candidates) {
        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        const src = el.getAttribute("src") ?? "";
        const title = el.getAttribute("title") ?? "";
        if (!matchesPattern(puzzlePattern, `${html} ${src} ${title}`)) continue;
        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(el),
        });
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      authSource: AUTH_CONTEXT.source,
      puzzleSource: PUZZLE_CAPTCHA.source,
    },
  );

  if (nodes.length === 0) return null;

  return {
    id: "accessible-auth-enhanced",
    impact: "serious",
    description:
      "Authentication uses object-recognition or image-selection CAPTCHA.",
    help: "Do not require image or object puzzles to authenticate (WCAG 3.3.9).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
