import type { Page } from "playwright";

import {
  AUTH_CONTEXT,
  CAPTCHA_WITH_CHALLENGE,
  PUZZLE_CAPTCHA,
  RUNTIME_MATCHES_SRC,
} from "../../patterns/multilingual.ts";
import { PUZZLE_HOST_NAMES } from "../../patterns/object-recognition-captcha.ts";
import {
  BROWSER_COLLECT_CAPTCHA_SRC,
  BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC,
} from "./captcha-candidates.ts";
import { type CapturedHit } from "./hit-capture.ts";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

export async function accessibleAuthEnhancedViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await pageEvaluateWithHitCapture(
    page,
    (
      captureHit,
      {
        authSource,
        puzzleSource,
        challengeSource,
        puzzleHosts,
        matchesSrc,
        collectSrc,
        objectRecognitionSrc,
      },
    ) => {
      const authPattern = new RegExp(authSource, "i");
      const puzzlePattern = new RegExp(puzzleSource, "i");
      const challengePattern = new RegExp(challengeSource, "i");

      const matchesPattern = new Function("pattern", "text", matchesSrc) as (
        pattern: RegExp,
        text: string,
      ) => boolean;

      const collectCandidates = new Function(
        `return (${collectSrc})`,
      )() as (doc?: Document) => Element[];

      const { isObjectRecognitionCaptchaElement } = new Function(
        `return (${objectRecognitionSrc})`,
      )() as {
        isObjectRecognitionCaptchaElement: (
          el: Element,
          matches: (pattern: RegExp, text: string) => boolean,
          puzzle: RegExp,
          challenge: RegExp,
          hosts: readonly string[],
        ) => boolean;
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
        if (
          !isObjectRecognitionCaptchaElement(
            el,
            matchesPattern,
            puzzlePattern,
            challengePattern,
            puzzleHosts,
          )
        ) {
          continue;
        }
        violations.push(captureHit(el));
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      authSource: AUTH_CONTEXT.source,
      puzzleSource: PUZZLE_CAPTCHA.source,
      challengeSource: CAPTCHA_WITH_CHALLENGE.source,
      puzzleHosts: [...PUZZLE_HOST_NAMES],
      matchesSrc: RUNTIME_MATCHES_SRC,
      collectSrc: BROWSER_COLLECT_CAPTCHA_SRC,
      objectRecognitionSrc: BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC,
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
