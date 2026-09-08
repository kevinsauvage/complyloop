import type { Page } from "playwright";
import { ERROR_PREVENTION_CONFIRM_DATASET_KEYS } from "../../patterns/error-prevention-criteria.ts";
import {
  AGREE_LABEL,
  CONFIRM_LABEL,
  HIGH_RISK,
  RUNTIME_MATCHES_SRC,
} from "../../patterns/multilingual.ts";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const RUNTIME_CONFIRM_LABEL = new RegExp(
  `${CONFIRM_LABEL.source}|${AGREE_LABEL.source}`,
  "i",
);

export async function errorPreventionViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hits = await page.evaluate(
    ({ highRiskSource, confirmSource, matchesSrc, datasetKeys, hitCaptureSrc }) => {
      const highRisk = new RegExp(highRiskSource, "i");
      const confirmLabel = new RegExp(confirmSource, "i");

      const matchesPattern = new Function("pattern", "text", matchesSrc) as (
        pattern: RegExp,
        text: string,
      ) => boolean;

      const { captureHit } = new Function(`return (${hitCaptureSrc})`)() as {
        captureHit: (el: Element) => CapturedHit;
      };

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

      const violations: CapturedHit[] = [];
      for (const form of document.querySelectorAll("form")) {
        if (!matchesPattern(highRisk, formContext(form))) continue;
        if (hasSafeguard(form)) continue;
        violations.push(captureHit(form));
        if (violations.length >= 5) break;
      }
      return violations;
    },
    {
      highRiskSource: HIGH_RISK.source,
      confirmSource: RUNTIME_CONFIRM_LABEL.source,
      matchesSrc: RUNTIME_MATCHES_SRC,
      datasetKeys: [...ERROR_PREVENTION_CONFIRM_DATASET_KEYS],
      hitCaptureSrc: BROWSER_HIT_CAPTURE_SRC,
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
