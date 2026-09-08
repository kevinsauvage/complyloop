import type { Page } from "playwright";
import {
  AUTH_CONTEXT,
  foldAccents,
  matchesMultilingual,
  PUZZLE_CAPTCHA,
} from "../../patterns/multilingual.ts";
import { collectCaptchaCandidates } from "./captcha-candidates.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const FOLD_ACCENTS_SOURCE = foldAccents.toString();
const MATCHES_MULTILINGUAL_SOURCE = matchesMultilingual.toString();
const COLLECT_CAPTCHA_SOURCE = collectCaptchaCandidates.toString();

export async function accessibleAuthEnhancedViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(
    ({ authSource, puzzleSource, foldSrc, matchesSrc, collectSrc }) => {
      const authPattern = new RegExp(authSource, "i");
      const puzzlePattern = new RegExp(puzzleSource, "i");

      const matchesPattern = new Function(
        "pattern",
        "text",
        `${foldSrc}; ${matchesSrc}; return matchesMultilingual(pattern, text);`,
      ) as (pattern: RegExp, text: string) => boolean;

      const collectCandidates = new Function(
        `return (${collectSrc})`,
      )() as (doc?: Document) => Element[];

      const authContext = [
        document.title,
        ...[...document.querySelectorAll("form, main, [role='main']")].map(
          (el) => el.textContent ?? "",
        ),
      ].join(" ");
      if (!matchesPattern(authPattern, authContext)) return [];

      const violations: Array<{ html: string; id: string; role: string | null; tagName: string }> = [];

      for (const el of collectCandidates(document)) {
        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        const src = el.getAttribute("src") ?? "";
        const title = el.getAttribute("title") ?? "";
        if (!matchesPattern(puzzlePattern, `${html} ${src} ${title}`)) continue;
        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          id: el.id, role: el.getAttribute("role"), tagName: el.tagName,
        });
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      authSource: AUTH_CONTEXT.source,
      puzzleSource: PUZZLE_CAPTCHA.source,
      foldSrc: FOLD_ACCENTS_SOURCE,
      matchesSrc: MATCHES_MULTILINGUAL_SOURCE,
      collectSrc: COLLECT_CAPTCHA_SOURCE,
    },
  );

  if (nodes.length === 0) return null;

  return {
    id: "accessible-auth-enhanced",
    impact: "serious",
    description:
      "Authentication uses object-recognition or image-selection CAPTCHA.",
    help: "Do not require image or object puzzles to authenticate (WCAG 3.3.9).",
    nodes: nodes.map((node) => ({ html: node.html, target: [selectorOf(node)] })),
  };
}
