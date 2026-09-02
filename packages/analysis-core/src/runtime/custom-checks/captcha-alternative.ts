import type { Page } from "playwright";
import { CAPTCHA_ALTERNATIVE, CAPTCHA_TOKEN } from "../../patterns/multilingual.js";
import type { CustomViolation } from "./types.js";

export async function captchaAlternativeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(
    ({ captchaSource, alternativeSource }) => {
      const captcha = new RegExp(captchaSource, "i");
      const alternative = new RegExp(alternativeSource, "i");

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

      function hasAlternative(container: Element): boolean {
        for (const el of container.querySelectorAll("a, button, audio")) {
          const text = (el.textContent ?? "").trim();
          const aria = el.getAttribute("aria-label") ?? "";
          const href = el.getAttribute("href") ?? "";
          if (matchesPattern(alternative, `${text} ${aria} ${href}`)) return true;
        }
        return container.querySelector("audio") !== null;
      }

      const violations: Array<{ html: string; selector: string }> = [];
      const candidates = [
        ...document.querySelectorAll("iframe"),
        ...document.querySelectorAll("[class*='captcha' i], [id*='captcha' i], [data-sitekey]"),
        ...document.querySelectorAll("img[alt*='captcha' i], img[src*='captcha' i]"),
      ];

      for (const el of candidates) {
        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        const src = el.getAttribute("src") ?? "";
        const cls = el.getAttribute("class") ?? "";
        const id = el.getAttribute("id") ?? "";
        if (!matchesPattern(captcha, `${html} ${src} ${cls} ${id}`)) continue;

        const container = el.closest("form, section, div") ?? el.parentElement ?? el;
        if (hasAlternative(container)) continue;

        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(el),
        });
        if (violations.length >= 5) break;
      }

      return violations;
    },
    {
      captchaSource: CAPTCHA_TOKEN.source,
      alternativeSource: CAPTCHA_ALTERNATIVE.source,
    },
  );

  if (nodes.length === 0) return null;

  return {
    id: "complyloop-captcha-alternative",
    impact: "serious",
    description: "CAPTCHA does not expose a non-visual alternative modality.",
    help: "Provide audio, logic, or human-contact alternatives for image CAPTCHA (RGAA 1.5).",
    nodes: nodes.map((node) => ({ html: node.html, target: [node.selector] })),
  };
}
