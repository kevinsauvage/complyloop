import type { Page } from "playwright-core";

import {
  CAPTCHA_ALTERNATIVE,
  CAPTCHA_TOKEN,
  RUNTIME_MATCHES_SRC,
} from "../../patterns/multilingual.ts";
import {
  BROWSER_CAPTCHA_MATCH_SRC,
  BROWSER_COLLECT_CAPTCHA_SRC,
  captchaProbeBootstrap,
} from "./captcha-candidates.ts";
import { type CapturedHit } from "./hit-capture.ts";
import {
  pageEvaluateWithHitCapture,
  toViolationNodes,
} from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";

export async function captchaAlternativeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await pageEvaluateWithHitCapture(
    page,
    (
      captureHit,
      {
        captchaSource,
        alternativeSource,
        matchesSrc,
        collectSrc,
        matchSrc,
        probeSrc,
      },
    ) => {
      const captcha = new RegExp(captchaSource, "i");
      const alternative = new RegExp(alternativeSource, "i");

      const { matchesPattern, collectCandidates, elementLooksLikeCaptcha } =
        new Function(`return (${probeSrc})`)()(
          matchesSrc,
          collectSrc,
          matchSrc,
        );

      function hasAlternative(container: Element): boolean {
        for (const el of container.querySelectorAll("a, button, audio")) {
          const text = (el.textContent ?? "").trim();
          const aria = el.getAttribute("aria-label") ?? "";
          const href = el.getAttribute("href") ?? "";
          if (matchesPattern(alternative, `${text} ${aria} ${href}`))
            return true;
        }
        return container.querySelector("audio") !== null;
      }

      const violations: CapturedHit[] = [];

      // reCAPTCHA v3 / Enterprise with a site key in `?render=` is invisible: it
      // scores the visitor and shows no challenge, so there is nothing to offer
      // an alternative to. Its footprint (badge iframe, response textarea,
      // loader script) must not be read as a visible CAPTCHA. A page that also
      // renders a visible widget keeps the check.
      const invisibleRecaptcha = Array.from(
        document.querySelectorAll("script[src*='recaptcha/']"),
      ).some((script) =>
        /recaptcha\/(?:api|enterprise)\.js\?[^#]*render=(?!explicit)[^&#]+/i.test(
          script.getAttribute("src") ?? "",
        ),
      );
      const visibleWidget = document.querySelector(
        ".g-recaptcha[data-sitekey]:not([data-size='invisible']), .h-captcha, .cf-turnstile, [class*='captcha' i] img",
      );
      if (invisibleRecaptcha && !visibleWidget) return violations;

      for (const el of collectCandidates(document)) {
        if (!elementLooksLikeCaptcha(el, matchesPattern, captcha)) continue;

        const container =
          el.closest("form, section, div") ?? el.parentElement ?? el;
        if (hasAlternative(container)) continue;

        violations.push(captureHit(el));
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      captchaSource: CAPTCHA_TOKEN.source,
      alternativeSource: CAPTCHA_ALTERNATIVE.source,
      matchesSrc: RUNTIME_MATCHES_SRC,
      collectSrc: BROWSER_COLLECT_CAPTCHA_SRC,
      matchSrc: BROWSER_CAPTCHA_MATCH_SRC,
      probeSrc: captchaProbeBootstrap.toString(),
    },
  );

  if (nodes.length === 0) return null;

  return {
    id: "captcha-alternative",
    impact: "serious",
    description: "CAPTCHA does not expose a non-visual alternative modality.",
    help: "Provide audio, logic, or human-contact alternatives for image CAPTCHA (RGAA 1.5).",
    nodes: toViolationNodes(nodes),
  };
}
