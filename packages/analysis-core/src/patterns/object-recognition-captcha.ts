/**
 * Shared object-recognition / image-selection CAPTCHA criteria for AST and
 * runtime `accessible-auth-enhanced` (WCAG 3.3.9). Host-specific plumbing
 * (JSX walk vs DOM evaluate) stays separate; this module owns the signal.
 */
import {
  CAPTCHA_WITH_CHALLENGE,
  matchesMultilingual,
  PUZZLE_CAPTCHA,
  PUZZLE_HOSTS,
} from "./multilingual.ts";

export { PUZZLE_HOST_NAMES } from "./captcha-config.ts";

export interface ObjectRecognitionCaptchaSignal {
  /** JSX / custom-element tag name (e.g. `PuzzleCaptcha`, `div`). */
  tagName: string;
  /** class, id, aria-label, title, outerHTML cues, etc. */
  contextText: string;
  /** True when `size` / `challenge` (or data-* equivalents) are present. */
  hasSizeOrChallengeAttr: boolean;
}

/**
 * Pure criterion: puzzle host, puzzle phrase, or challenge-provider + size/challenge.
 * Used directly by AST; runtime DOM leaf mirrors this logic for `page.evaluate`.
 */
export function isObjectRecognitionCaptchaSignal(
  signal: ObjectRecognitionCaptchaSignal,
): boolean {
  if (PUZZLE_HOSTS.has(signal.tagName)) return true;

  if (matchesMultilingual(PUZZLE_CAPTCHA, signal.contextText)) return true;

  if (
    matchesMultilingual(CAPTCHA_WITH_CHALLENGE, signal.contextText) &&
    signal.hasSizeOrChallengeAttr
  ) {
    return true;
  }

  return false;
}
