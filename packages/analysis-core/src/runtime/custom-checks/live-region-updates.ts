import type { Page } from "playwright";
import type { CustomViolation } from "./types.ts";
import {
  isInvalidField,
  submitFirstValidatableForm,
} from "./form-submit-probe.ts";
import { BROWSER_HIT_CAPTURE_SRC, type CapturedHit } from "./hit-capture.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

/** Form-validation feedback — not marketing copy with incidental substrings. */
const FORM_STATUS_PATTERN_SOURCE =
  String.raw`\b(error|invalid|incorrect|required|must|missing|failed|warning|alert)\b`;

const IS_INVALID_SOURCE = isInvalidField.toString();

type StatusHit = CapturedHit & { text: string };

type CollectFormStatusHits = (
  statusPattern: RegExp,
  captureHit: (el: Element) => CapturedHit,
  options?: { excludeKeys?: string[]; limit?: number },
) => StatusHit[];

/**
 * Shared before/after collector for status text outside live regions.
 * Injected into the page via `.toString()` — keep free of Node-only imports.
 */
function collectFormStatusHits(
  statusPattern: RegExp,
  captureHit: (el: Element) => CapturedHit,
  options: { excludeKeys?: string[]; limit?: number } = {},
): StatusHit[] {
  const liveSelector = '[aria-live], [role="status"], [role="alert"]';
  const hits: StatusHit[] = [];
  const excludeKeys = options.excludeKeys;
  const limit = options.limit;

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
    if (excludeKeys && excludeKeys.includes(key)) continue;

    const hit = captureHit(el);
    hits.push({
      ...hit,
      text,
    });
    if (limit !== undefined && hits.length >= limit) break;
  }
  return hits;
}

const COLLECT_STATUS_HITS_SRC = collectFormStatusHits.toString();

const BROWSER_LIVE_REGION_SRC = `(function liveRegionSource() {
  const hit = (${BROWSER_HIT_CAPTURE_SRC});
  ${COLLECT_STATUS_HITS_SRC}
  return { captureHit: hit.captureHit, collectFormStatusHits };
})()`;

type LiveRegionHelpers = {
  captureHit: (el: Element) => CapturedHit;
  collectFormStatusHits: CollectFormStatusHits;
};

export async function liveRegionUpdatesViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const before = await page.evaluate(
    ({ patternSource, helperSrc }) => {
      const statusPattern = new RegExp(patternSource, "i");
      const { captureHit, collectFormStatusHits } = new Function(
        `return (${helperSrc})`,
      )() as LiveRegionHelpers;

      return {
        liveText: Array.from(
          document.querySelectorAll(
            '[aria-live], [role="status"], [role="alert"]',
          ),
        )
          .map((el) => (el.textContent ?? "").trim())
          .join("|"),
        statusKeys: collectFormStatusHits(statusPattern, captureHit).map(
          (hit) => `${hit.id}\0${hit.role ?? ""}\0${hit.tagName}::${hit.text}`,
        ),
      };
    },
    {
      patternSource: FORM_STATUS_PATTERN_SOURCE,
      helperSrc: BROWSER_LIVE_REGION_SRC,
    },
  );

  const submitted = await page.evaluate(submitFirstValidatableForm);

  if (!submitted) return null;

  await page.waitForTimeout(300);

  const after = await page.evaluate(
    ({ beforeKeys, beforeLiveText, patternSource, isInvalidSrc, helperSrc }) => {
      const statusPattern = new RegExp(patternSource, "i");
      const isInvalid = new Function(`return (${isInvalidSrc})`)() as (
        el: Element,
      ) => boolean;
      const { captureHit, collectFormStatusHits } = new Function(
        `return (${helperSrc})`,
      )() as LiveRegionHelpers;

      const invalidFields = Array.from(
        document.querySelectorAll(
          "input, select, textarea, [aria-invalid='true']",
        ),
      ).filter(isInvalid);
      if (invalidFields.length === 0) {
        return {
          liveText: "",
          newHits: [] as StatusHit[],
          beforeLiveText,
          hasInvalidFields: false,
        };
      }

      const liveText = Array.from(
        document.querySelectorAll(
          '[aria-live], [role="status"], [role="alert"]',
        ),
      )
        .map((el) => (el.textContent ?? "").trim())
        .join("|");

      const newHits = collectFormStatusHits(statusPattern, captureHit, {
        excludeKeys: beforeKeys,
        limit: 5,
      });

      return { liveText, newHits, beforeLiveText, hasInvalidFields: true };
    },
    {
      beforeKeys: before.statusKeys,
      beforeLiveText: before.liveText,
      patternSource: FORM_STATUS_PATTERN_SOURCE,
      isInvalidSrc: IS_INVALID_SOURCE,
      helperSrc: BROWSER_LIVE_REGION_SRC,
    },
  );

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
