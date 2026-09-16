/**
 * DOM captcha helpers for Playwright `page.evaluate`.
 * Keep functions import-free so `.toString()` is safe under Vite SSR (same
 * constraint as {@link ./hit-capture.ts}).
 */

/** Collects captcha candidate elements (iframe, class/id/data-sitekey, captcha imgs, puzzle hosts). */
export function collectCaptchaCandidates(doc: Document = document): Element[] {
  // Import-free for page injection — keep in sync with CAPTCHA_CANDIDATE_SELECTORS
  // in patterns/captcha-config.ts (parity test enforces it).
  const found = new Set<Element>();
  const selectors = [
    "iframe",
    "[class*='captcha' i], [id*='captcha' i], [data-sitekey]",
    "img[alt*='captcha' i], img[src*='captcha' i]",
    // Puzzle / image-challenge hosts (align with PUZZLE_HOSTS / CAPTCHA_WITH_CHALLENGE)
    "[class*='recaptcha' i], [id*='recaptcha' i]",
    "[class*='hcaptcha' i], [id*='hcaptcha' i]",
    "[class*='funcaptcha' i], [class*='imagecaptcha' i], [class*='puzzlecaptcha' i]",
    "captcha, imagecaptcha, puzzlecaptcha",
  ];
  for (const selector of selectors) {
    for (const el of doc.querySelectorAll(selector)) {
      found.add(el);
    }
  }
  return [...found];
}

/** Text blob matched against {@link CAPTCHA_TOKEN} for applicability + alternative checks. */
export function captchaCandidateMatchText(el: Element): string {
  return `${el.outerHTML} ${el.getAttribute("src") ?? ""} ${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
}

export function elementLooksLikeCaptcha(
  el: Element,
  matchesPattern: (pattern: RegExp, text: string) => boolean,
  captchaPattern: RegExp,
): boolean {
  return matchesPattern(captchaPattern, captchaCandidateMatchText(el));
}

export type CaptchaProbe = {
  matchesPattern: (pattern: RegExp, text: string) => boolean;
  collectCandidates: (doc?: Document) => Element[];
  elementLooksLikeCaptcha: (
    el: Element,
    matches: (pattern: RegExp, text: string) => boolean,
    pattern: RegExp,
  ) => boolean;
};

/**
 * Browser-side bootstrap shared by the applicability probe and the
 * captcha-alternative check. Rebuilt inside Playwright by injecting this
 * function's source; the caller supplies the serialized `matches` impl and
 * the collect/match sources as string args.
 */
export function captchaProbeBootstrap(
  matchesSrc: string,
  collectSrc: string,
  matchSrc: string,
): CaptchaProbe {
  const matchesPattern = new Function("pattern", "text", matchesSrc) as (
    pattern: RegExp,
    text: string,
  ) => boolean;

  const collectCandidates = new Function(`return (${collectSrc})`)() as (
    doc?: Document,
  ) => Element[];

  const { elementLooksLikeCaptcha: looksLike } = new Function(
    `return (${matchSrc})`,
  )() as {
    elementLooksLikeCaptcha: CaptchaProbe["elementLooksLikeCaptcha"];
  };

  return {
    matchesPattern,
    collectCandidates,
    elementLooksLikeCaptcha: looksLike,
  };
}

/**
 * DOM mirror of {@link isObjectRecognitionCaptchaSignal} — must stay aligned.
 * `puzzleHosts` is the PascalCase list from `PUZZLE_HOST_NAMES`.
 */
export function isObjectRecognitionCaptchaElement(
  el: Element,
  matchesPattern: (pattern: RegExp, text: string) => boolean,
  puzzlePattern: RegExp,
  challengePattern: RegExp,
  puzzleHosts: readonly string[],
): boolean {
  const tag = el.tagName;
  const tagLower = tag.toLowerCase();
  const cls = el.getAttribute("class") ?? "";
  const id = el.getAttribute("id") ?? "";
  const clsLower = cls.toLowerCase();
  const idLower = id.toLowerCase();

  for (const host of puzzleHosts) {
    const hostLower = host.toLowerCase();
    if (tagLower === hostLower) return true;
    // Exact class/id token only — do not substring-match inside "g-recaptcha".
    if (clsLower.split(/\s+/).includes(hostLower) || idLower === hostLower) {
      return true;
    }
  }

  const context = [
    el.outerHTML,
    el.getAttribute("src") ?? "",
    el.getAttribute("title") ?? "",
    el.getAttribute("aria-label") ?? "",
    cls,
    id,
    tag,
  ].join(" ");

  if (matchesPattern(puzzlePattern, context)) return true;

  const hasSizeOrChallengeAttr =
    el.hasAttribute("size") ||
    el.hasAttribute("challenge") ||
    el.getAttribute("data-size") !== null ||
    el.getAttribute("data-challenge") !== null;

  if (matchesPattern(challengePattern, context) && hasSizeOrChallengeAttr) {
    return true;
  }

  return false;
}

/**
 * Single source for Playwright injection — import this instead of calling
 * `collectCaptchaCandidates.toString()` at each call site.
 */
export const BROWSER_COLLECT_CAPTCHA_SRC = collectCaptchaCandidates.toString();

/**
 * Reconstruct with:
 * `new Function(\`return (${BROWSER_CAPTCHA_MATCH_SRC})\`)()`
 * → `{ captchaCandidateMatchText, elementLooksLikeCaptcha }`
 */
export const BROWSER_CAPTCHA_MATCH_SRC = `(function captchaMatchSource() {
  const captchaCandidateMatchText = (${captchaCandidateMatchText.toString()});
  const elementLooksLikeCaptcha = (${elementLooksLikeCaptcha.toString()});
  return {
    captchaCandidateMatchText: captchaCandidateMatchText,
    elementLooksLikeCaptcha: elementLooksLikeCaptcha
  };
})()`;

/**
 * Reconstruct with:
 * `new Function(\`return (${BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC})\`)()`
 * → `{ isObjectRecognitionCaptchaElement }`
 */
export const BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC = `(function objectRecognitionCaptchaSource() {
  const isObjectRecognitionCaptchaElement = (${isObjectRecognitionCaptchaElement.toString()});
  return { isObjectRecognitionCaptchaElement: isObjectRecognitionCaptchaElement };
})()`;
