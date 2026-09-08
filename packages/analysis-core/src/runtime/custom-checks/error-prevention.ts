import type { Page } from "playwright";
import { ERROR_PREVENTION_CONFIRM_DATASET_KEYS } from "../../patterns/error-prevention-criteria.ts";
import {
  AGREE_LABEL,
  CONFIRM_LABEL,
  HIGH_RISK,
  foldAccents,
  matchesMultilingual,
} from "../../patterns/multilingual.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf, type SelectorRef } from "./widget-keyboard-utils.ts";

interface FormHit extends SelectorRef {
  html: string;
}

const RUNTIME_CONFIRM_LABEL = new RegExp(
  `${CONFIRM_LABEL.source}|${AGREE_LABEL.source}`,
  "i",
);

const FOLD_ACCENTS_SOURCE = foldAccents.toString();
const MATCHES_MULTILINGUAL_SOURCE = matchesMultilingual.toString();

export async function errorPreventionViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hits = await page.evaluate(
    ({ highRiskSource, confirmSource, foldSrc, matchesSrc, datasetKeys }) => {
      const highRisk = new RegExp(highRiskSource, "i");
      const confirmLabel = new RegExp(confirmSource, "i");

      const matchesPattern = new Function(
        "pattern",
        "text",
        `${foldSrc}; ${matchesSrc}; return matchesMultilingual(pattern, text);`,
      ) as (pattern: RegExp, text: string) => boolean;

      function formContext(form: HTMLFormElement): string {
        return [
          form.getAttribute("action") ?? "",
          form.getAttribute("name") ?? "",
          form.getAttribute("id") ?? "",
          form.getAttribute("aria-label") ?? "",
          form.textContent ?? "",
        ].join(" ");
      }

      function hasSafeguard(form: HTMLFormElement): boolean {
        for (const el of form.querySelectorAll("button, input, label, a")) {
          const text = (el.textContent ?? "").trim();
          const aria = el.getAttribute("aria-label") ?? "";
          if (matchesPattern(confirmLabel, `${text} ${aria}`)) return true;
        }
        for (const key of datasetKeys) {
          if (form.dataset[key] !== undefined) return true;
        }
        return false;
      }

      const violations: FormHit[] = [];
      for (const form of document.querySelectorAll("form")) {
        if (!matchesPattern(highRisk, formContext(form))) continue;
        if (hasSafeguard(form)) continue;
        const html = form.outerHTML.replace(/\s+/g, " ").trim();
        violations.push({
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          id: form.id, role: form.getAttribute("role"), tagName: form.tagName,
        });
        if (violations.length >= 5) break;
      }
      return violations;
    },
    {
      highRiskSource: HIGH_RISK.source,
      confirmSource: RUNTIME_CONFIRM_LABEL.source,
      foldSrc: FOLD_ACCENTS_SOURCE,
      matchesSrc: MATCHES_MULTILINGUAL_SOURCE,
      datasetKeys: [...ERROR_PREVENTION_CONFIRM_DATASET_KEYS],
    },
  );

  if (hits.length === 0) return null;

  return {
    id: "error-prevention",
    impact: "serious",
    description:
      "High-impact form can submit without a review, confirm, or agreement step.",
    help: "Legal, financial, and test submissions must be reversible, checked, or confirmed (WCAG 3.3.4).",
    nodes: hits.map((hit) => ({ html: hit.html, target: [selectorOf(hit)] })),
  };
}
