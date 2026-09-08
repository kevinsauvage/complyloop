import type { Page } from "playwright";
import type { CustomViolation } from "./types.ts";
import {
  isInvalidField,
  submitFirstValidatableForm,
} from "./form-submit-probe.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

/** Form-validation feedback — not marketing copy with incidental substrings. */
const FORM_STATUS_PATTERN_SOURCE =
  String.raw`\b(error|invalid|incorrect|required|must|missing|failed|warning|alert)\b`;

const IS_INVALID_SOURCE = isInvalidField.toString();

export async function liveRegionUpdatesViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const before = await page.evaluate(({ patternSource }) => {
    const statusPattern = new RegExp(patternSource, "i");
    function collectStatusHits(): Array<{ html: string; id: string; role: string | null; tagName: string; text: string }> {
      const liveSelector = '[aria-live], [role="status"], [role="alert"]';
      const hits: Array<{ html: string; id: string; role: string | null; tagName: string; text: string }> = [];
      for (const el of document.querySelectorAll("p, div, span, li, output")) {
        const text = (el.textContent ?? "").trim();
        if (text.length < 4 || text.length > 240) continue;
        if (!statusPattern.test(text)) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (parseFloat(style.opacity) === 0) continue;
        if (el.closest(liveSelector)) continue;
        if (el.closest('[aria-hidden="true"]')) continue;
        hits.push({
          text,
          html: el.outerHTML.replace(/\s+/g, " ").trim(),
          id: el.id, role: el.getAttribute("role"), tagName: el.tagName,
        });
      }
      return hits;
    }

    return {
      liveText: Array.from(
        document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'),
      )
        .map((el) => (el.textContent ?? "").trim())
        .join("|"),
      statusKeys: collectStatusHits().map(
        (hit) => `${hit.id}\0${hit.role ?? ""}\0${hit.tagName}::${hit.text}`,
      ),
    };
  }, { patternSource: FORM_STATUS_PATTERN_SOURCE });

  const submitted = await page.evaluate(submitFirstValidatableForm);

  if (!submitted) return null;

  await page.waitForTimeout(300);

  const after = await page.evaluate(({ beforeKeys, beforeLiveText, patternSource, isInvalidSrc }) => {
    const statusPattern = new RegExp(patternSource, "i");
    const isInvalid = new Function(`return (${isInvalidSrc})`)() as (
      el: Element,
    ) => boolean;

    const invalidFields = Array.from(
      document.querySelectorAll("input, select, textarea, [aria-invalid='true']"),
    ).filter(isInvalid);
    if (invalidFields.length === 0) {
      return { liveText: "", newHits: [], beforeLiveText, hasInvalidFields: false };
    }

    const liveSelector = '[aria-live], [role="status"], [role="alert"]';
    const liveText = Array.from(
      document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'),
    )
      .map((el) => (el.textContent ?? "").trim())
      .join("|");

    const newHits: Array<{ html: string; id: string; role: string | null; tagName: string; text: string }> = [];
    for (const el of document.querySelectorAll("p, div, span, li, output")) {
      const text = (el.textContent ?? "").trim();
      if (text.length < 4 || text.length > 240) continue;
      if (!statusPattern.test(text)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (parseFloat(style.opacity) === 0) continue;
      if (el.closest(liveSelector)) continue;
      if (el.closest('[aria-hidden="true"]')) continue;

      const key = `${el.id}\0${el.getAttribute("role") ?? ""}\0${el.tagName}::${text}`;
      if (beforeKeys.includes(key)) continue;

      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      newHits.push({
        text,
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        id: el.id, role: el.getAttribute("role"), tagName: el.tagName,
      });
      if (newHits.length >= 5) break;
    }

    return { liveText, newHits, beforeLiveText, hasInvalidFields: true };
  }, {
    beforeKeys: before.statusKeys,
    beforeLiveText: before.liveText,
    patternSource: FORM_STATUS_PATTERN_SOURCE,
    isInvalidSrc: IS_INVALID_SOURCE,
  });

  if (!after.hasInvalidFields || after.newHits.length === 0) return null;
  if (after.liveText !== after.beforeLiveText) return null;

  return {
    id: "live-region-updates",
    impact: "moderate",
    description:
      "Validation feedback appeared after submit but was not exposed through a live region.",
    help: 'Wrap dynamic status text in role="status", role="alert", or aria-live (WCAG 4.1.3 / RGAA 7.5).',
    nodes: after.newHits.map((hit) => ({
      html: hit.html,
      target: [selectorOf(hit)],
      failureSummary:
        "This status message is visible but not inside aria-live, role=status, or role=alert.",
    })),
  };
}
