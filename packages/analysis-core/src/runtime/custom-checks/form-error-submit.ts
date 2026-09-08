import type { Page } from "playwright";
import type { CustomViolation } from "./types.ts";
import {
  isInvalidField,
  submitFirstValidatableForm,
} from "./form-submit-probe.ts";
import { selectorOf, type SelectorRef } from "./widget-keyboard-utils.ts";

type FormErrorHit = SelectorRef & {
  html: string;
  failureSummary: string;
};

const IS_INVALID_SOURCE = isInvalidField.toString();

/**
 * Submits the first HTML5-validated form empty/invalid and checks that surfaced
 * errors are programmatically associated and focus is predictable.
 */
export async function formErrorSubmitViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const submitted = await page.evaluate(submitFirstValidatableForm);

  if (!submitted) return null;

  await page.waitForTimeout(150);

  const hits = await page.evaluate((isInvalidSrc) => {
    const maxNodes = 5;

    const isInvalid = new Function(`return (${isInvalidSrc})`)() as (
      el: Element,
    ) => boolean;

    function isAssociated(field: Element): boolean {
      const ids = new Set<string>();
      for (const id of (field.getAttribute("aria-describedby") ?? "").split(/\s+/)) {
        if (id) ids.add(id);
      }
      const errMsg = field.getAttribute("aria-errormessage");
      if (errMsg) ids.add(errMsg);
      for (const id of ids) {
        const target = document.getElementById(id);
        if (target && (target.textContent ?? "").trim().length > 0) return true;
      }
      return false;
    }

    const invalidFields = Array.from(
      document.querySelectorAll("input, select, textarea, [aria-invalid='true']"),
    ).filter(isInvalid);

    if (invalidFields.length === 0) return [] as FormErrorHit[];

    const active = document.activeElement;
    const focusOk =
      active instanceof Element &&
      (isInvalid(active) ||
        invalidFields.some((field) => field.contains(active) || active.contains(field)));

    const found: FormErrorHit[] = [];

    for (const field of invalidFields) {
      if (!(field instanceof HTMLElement)) continue;
      if (isAssociated(field)) continue;

      const html = field.outerHTML.replace(/\s+/g, " ").trim();
      found.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        id: field.id,
        role: field.getAttribute("role"),
        tagName: field.tagName,
        failureSummary:
          "After submit, this invalid field has no programmatic association to visible error text (aria-describedby / aria-errormessage).",
      });
      if (found.length >= maxNodes) break;
    }

    if (found.length === 0 && !focusOk && invalidFields[0] instanceof HTMLElement) {
      const field = invalidFields[0];
      const html = field.outerHTML.replace(/\s+/g, " ").trim();
      found.push({
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        id: field.id,
        role: field.getAttribute("role"),
        tagName: field.tagName,
        failureSummary:
          "After submit, focus did not move to the invalid field or its associated error.",
      });
    }

    return found;
  }, IS_INVALID_SOURCE);

  if (hits.length === 0) return null;

  return {
    id: "form-error-association",
    impact: "serious",
    description:
      "Form validation errors after submit are not programmatically associated with their fields, or focus did not move predictably.",
    help: "Associate error text with aria-describedby or aria-errormessage and move focus to the first invalid field (WCAG 3.3.1 / RGAA 11.10).",
    nodes: hits.map((hit) => ({
      html: hit.html,
      target: [selectorOf(hit)],
      failureSummary: hit.failureSummary,
    })),
  };
}
