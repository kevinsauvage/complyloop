import type { Page } from "playwright";
import {
  AUTH_CONTEXT,
  PUZZLE_CAPTCHA,
  RUNTIME_MATCHES_SRC,
} from "../../patterns/multilingual.ts";
import { collectCaptchaCandidates } from "./captcha-candidates.ts";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const COLLECT_CAPTCHA_SOURCE = collectCaptchaCandidates.toString();

export async function accessibleAuthEnhancedViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(
    ({ authSource, puzzleSource, matchesSrc, collectSrc, hitCaptureSrc }) => {
      const authPattern = new RegExp(authSource, "i");
      const puzzlePattern = new RegExp(puzzleSource, "i");

      const matchesPattern = new Function("pattern", "text", matchesSrc) as (
        pattern: RegExp,
        text: string,
      ) => boolean;

      const collectCandidates = new Function(
        `return (${collectSrc})`,
      )() as (doc?: Document) => Element[];

      const { captureHit } = new Function(`return (${hitCaptureSrc})`)() as {
        captureHit: (el: Element) => CapturedHit;
      };

      const authContext = [
        document.title,
        ...[...document.querySelectorAll("form, main, [role='main']")].map(
          (el) => el.textContent ?? "",
        ),
      ].join(" ");
      if (!matchesPattern(authPattern, authContext)) return [];

      const violations: CapturedHit[] = [];

      for (const el of collectCandidates(document)) {
        const html = el.outerHTML;
        const src = el.getAttribute("src") ?? "";
        const title = el.getAttribute("title") ?? "";
        if (!matchesPattern(puzzlePattern, `${html} ${src} ${title}`)) continue;
        violations.push(captureHit(el));
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      authSource: AUTH_CONTEXT.source,
      puzzleSource: PUZZLE_CAPTCHA.source,
      matchesSrc: RUNTIME_MATCHES_SRC,
      collectSrc: COLLECT_CAPTCHA_SOURCE,
      hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
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
