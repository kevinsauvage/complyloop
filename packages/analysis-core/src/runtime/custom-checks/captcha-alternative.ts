import type { Page } from "playwright";
import {
  CAPTCHA_ALTERNATIVE,
  CAPTCHA_TOKEN,
  RUNTIME_MATCHES_SRC,
} from "../../patterns/multilingual.ts";
import { collectCaptchaCandidates } from "./captcha-candidates.ts";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const COLLECT_CAPTCHA_SOURCE = collectCaptchaCandidates.toString();

export async function captchaAlternativeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(
    ({ captchaSource, alternativeSource, matchesSrc, collectSrc, hitCaptureSrc }) => {
      const captcha = new RegExp(captchaSource, "i");
      const alternative = new RegExp(alternativeSource, "i");

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

      function hasAlternative(container: Element): boolean {
        for (const el of container.querySelectorAll("a, button, audio")) {
          const text = (el.textContent ?? "").trim();
          const aria = el.getAttribute("aria-label") ?? "";
          const href = el.getAttribute("href") ?? "";
          if (matchesPattern(alternative, `${text} ${aria} ${href}`)) return true;
        }
        return container.querySelector("audio") !== null;
      }

      const violations: CapturedHit[] = [];

      for (const el of collectCandidates(document)) {
        const html = el.outerHTML;
        const src = el.getAttribute("src") ?? "";
        const cls = el.getAttribute("class") ?? "";
        const id = el.getAttribute("id") ?? "";
        if (!matchesPattern(captcha, `${html} ${src} ${cls} ${id}`)) continue;

        const container = el.closest("form, section, div") ?? el.parentElement ?? el;
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
      collectSrc: COLLECT_CAPTCHA_SOURCE,
      hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
    },
  );

  if (nodes.length === 0) return null;

  return {
    id: "captcha-alternative",
    impact: "serious",
    description: "CAPTCHA does not expose a non-visual alternative modality.",
    help: "Provide audio, logic, or human-contact alternatives for image CAPTCHA (RGAA 1.5).",
    nodes: nodes.map((node) => ({ html: node.html, target: [selectorOf(node)] })),
  };
}
