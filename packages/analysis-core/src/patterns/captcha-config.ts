/**
 * Single source for "what counts as a CAPTCHA" across AST + runtime.
 * Regex patterns stay in `patterns/multilingual.ts` (locale heuristics);
 * this module owns the host/component names and DOM candidate selectors so
 * a new provider is added once here, not in 3–4 places.
 *
 * Constraint: `collectCaptchaCandidates` in
 * `runtime/custom-checks/captcha-candidates.ts` is stringified into the page
 * and must stay import-free — it inlines these selectors. Keep them identical;
 * `captcha-config.test.ts` asserts parity.
 */

/** Known captcha host component tag names (AST + DOM). */
export const CAPTCHA_COMPONENT_HOSTS = [
  "ReCAPTCHA",
  "HCaptcha",
  "Captcha",
  "Turnstile",
  "FriendlyCaptcha",
] as const;

/** PascalCase puzzle/image-challenge hosts (AST tag + DOM tag/class/id). */
export const PUZZLE_HOST_NAMES = ["Captcha", "ImageCaptcha", "PuzzleCaptcha"] as const;

/** DOM candidate selectors (must match `collectCaptchaCandidates` inline list). */
export const CAPTCHA_CANDIDATE_SELECTORS = [
  "iframe",
  "[class*='captcha' i], [id*='captcha' i], [data-sitekey]",
  "img[alt*='captcha' i], img[src*='captcha' i]",
  "[class*='recaptcha' i], [id*='recaptcha' i]",
  "[class*='hcaptcha' i], [id*='hcaptcha' i]",
  "[class*='funcaptcha' i], [class*='imagecaptcha' i], [class*='puzzlecaptcha' i]",
  "captcha, imagecaptcha, puzzlecaptcha",
] as const;
