import type { Page } from "playwright";
import {
  AGREE_LABEL,
  CONFIRM_LABEL,
  HIGH_RISK,
} from "../../patterns/multilingual";
import type { CustomViolation } from "./types";

interface FormHit {
  html: string;
  selector: string;
}

const RUNTIME_CONFIRM_LABEL = new RegExp(
  `${CONFIRM_LABEL.source}|${AGREE_LABEL.source}`,
  "i",
);

export async function errorPreventionViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hits = await page.evaluate(
    ({ highRiskSource, confirmSource }) => {
      const highRisk = new RegExp(highRiskSource, "i");
      const confirmLabel = new RegExp(confirmSource, "i");

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
        if (
          form.dataset.confirm !== undefined ||
          form.dataset.reviewStep !== undefined ||
          form.dataset.confirmSubmit !== undefined
        ) {
          return true;
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
          selector: selectorOf(form),
        });
        if (violations.length >= 5) break;
      }
      return violations;
    },
    {
      highRiskSource: HIGH_RISK.source,
      confirmSource: RUNTIME_CONFIRM_LABEL.source,
    },
  );

  if (hits.length === 0) return null;

  return {
    id: "complyloop-error-prevention",
    impact: "serious",
    description:
      "High-impact form can submit without a review, confirm, or agreement step.",
    help: "Legal, financial, and test submissions must be reversible, checked, or confirmed (WCAG 3.3.4).",
    nodes: hits.map((hit) => ({ html: hit.html, target: [hit.selector] })),
  };
}
