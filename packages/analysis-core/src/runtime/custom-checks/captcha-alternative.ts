import type { Page } from "playwright";
import {
  CAPTCHA_ALTERNATIVE,
  CAPTCHA_TOKEN,
  foldAccents,
  matchesMultilingual,
} from "../../patterns/multilingual.ts";
import { collectCaptchaCandidates } from "./captcha-candidates.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const FOLD_ACCENTS_SOURCE = foldAccents.toString();
const MATCHES_MULTILINGUAL_SOURCE = matchesMultilingual.toString();
const COLLECT_CAPTCHA_SOURCE = collectCaptchaCandidates.toString();

export async function captchaAlternativeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(
    ({ captchaSource, alternativeSource, foldSrc, matchesSrc, collectSrc }) => {
      const captcha = new RegExp(captchaSource, "i");
      const alternative = new RegExp(alternativeSource, "i");

      const matchesPattern = new Function(
        "pattern",
        "text",
        `${foldSrc}; ${matchesSrc}; return matchesMultilingual(pattern, text);`,
      ) as (pattern: RegExp, text: string) => boolean;

      const collectCandidates = new Function(
        `return (${collectSrc})`,
      )() as (doc?: Document) => Element[];

      function hasAlternative(container: Element): boolean {
        for (const el of container.querySelectorAll("a, button, audio")) {
          const text = (el.textContent ?? "").trim();
          const aria = el.getAttribute("aria-label") ?? "";
          const href = el.getAttribute("href") ?? "";
          if (matchesPattern(alternative, `${text} ${aria} ${href}`)) return true;
        }
        return container.querySelector("audio") !== null;
      }

      const violations: Array<{ html: string; id: string; role: string | null; tagName: string }> = [];

      for (const el of collectCandidates(document)) {
        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        const src = el.getAttribute("src") ?? "";
        const cls = el.getAttribute("class") ?? "";
        const id = el.getAttribute("id") ?? "";
        if (!matchesPattern(captcha, `${html} ${src} ${cls} ${id}`)) continue;

        const container = el.closest("form, section, div") ?? el.parentElement ?? el;
        if (hasAlternative(container)) continue;

        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          id: el.id, role: el.getAttribute("role"), tagName: el.tagName,
        });
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      captchaSource: CAPTCHA_TOKEN.source,
      alternativeSource: CAPTCHA_ALTERNATIVE.source,
      foldSrc: FOLD_ACCENTS_SOURCE,
      matchesSrc: MATCHES_MULTILINGUAL_SOURCE,
      collectSrc: COLLECT_CAPTCHA_SOURCE,
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
