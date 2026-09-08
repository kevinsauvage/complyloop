import type { Page } from "playwright";
import type { CheckId } from "../types.ts";
import {
  CAPTCHA_TOKEN,
  RUNTIME_MATCHES_SRC,
} from "../patterns/multilingual.ts";
import {
  BROWSER_CAPTCHA_MATCH_SRC,
  BROWSER_COLLECT_CAPTCHA_SRC,
} from "./custom-checks/captcha-candidates.ts";

export interface ApplicabilityObservation {
  checkId: CheckId;
  /** Human-readable fact recorded as evidence when status becomes not_applicable. */
  fact: string;
  url: string;
}

const TEMPORAL_MEDIA_CHECK_IDS = [
  "video-caption",
  "audio-caption",
  "media-keyboard",
  "media-controls-present",
] as const satisfies readonly CheckId[];

const NONTEMPORAL_MEDIA_CHECK_IDS = [
  "media-identification",
] as const satisfies readonly CheckId[];

const CAPTCHA_CHECK_IDS = [
  "captcha-alternative",
] as const satisfies readonly CheckId[];

const LAYOUT_TABLE_CHECK_IDS = [
  "layout-table-linearization",
] as const satisfies readonly CheckId[];

export const APPLICABILITY_OBSERVABLE_CHECK_IDS = [
  ...TEMPORAL_MEDIA_CHECK_IDS,
  ...NONTEMPORAL_MEDIA_CHECK_IDS,
  ...CAPTCHA_CHECK_IDS,
  ...LAYOUT_TABLE_CHECK_IDS,
] as const satisfies readonly CheckId[];

const APPLICABILITY_OBSERVABLE = new Set<string>(APPLICABILITY_OBSERVABLE_CHECK_IDS);

export function isApplicabilityObservableCheck(checkId: string): boolean {
  return APPLICABILITY_OBSERVABLE.has(checkId);
}

interface PageApplicabilityAbsent {
  temporalMedia: boolean;
  nontemporalMedia: boolean;
  captcha: boolean;
  layoutTable: boolean;
}

/**
 * Deterministic DOM probes: when content is absent on a page, emit observations
 * that status derivation can map to `not_applicable` (after site-wide aggregation).
 */
export async function applicabilityObservationsForPage(
  page: Page,
  url: string,
): Promise<ApplicabilityObservation[]> {
  const absent = await page.evaluate(
    ({ captchaSource, matchesSrc, collectSrc, matchSrc }) => {
      const matchesPattern = new Function("pattern", "text", matchesSrc) as (
        pattern: RegExp,
        text: string,
      ) => boolean;

      const collectCandidates = new Function(
        `return (${collectSrc})`,
      )() as (doc?: Document) => Element[];

      const { elementLooksLikeCaptcha } = new Function(
        `return (${matchSrc})`,
      )() as {
        elementLooksLikeCaptcha: (
          el: Element,
          matches: (pattern: RegExp, text: string) => boolean,
          pattern: RegExp,
        ) => boolean;
      };

      const captcha = new RegExp(captchaSource, "i");

      function hasCaptcha(): boolean {
        for (const el of collectCandidates(document)) {
          if (elementLooksLikeCaptcha(el, matchesPattern, captcha)) return true;
        }
        return false;
      }

      function isLayoutTable(table: HTMLTableElement): boolean {
        // role="presentation" declares a layout table (matches
        // layout-table-linearization.ts). Header markup makes it a data table.
        if (table.getAttribute("role") === "presentation") return true;
        if (table.querySelector("th, caption, [headers], [scope], thead")) {
          return false;
        }
        return table.querySelectorAll("td").length > 1;
      }

      function hasLayoutTable(): boolean {
        for (const table of document.querySelectorAll("table")) {
          if (table instanceof HTMLTableElement && isLayoutTable(table)) {
            return true;
          }
        }
        return false;
      }

      function hasNontemporalMedia(): boolean {
        for (const el of document.querySelectorAll("embed, canvas")) {
          if (el.getAttribute("role") === "presentation") continue;
          if (el.getAttribute("aria-hidden") === "true") continue;
          return true;
        }
        return false;
      }

      return {
        temporalMedia: document.querySelector("video, audio, track") === null,
        nontemporalMedia: !hasNontemporalMedia(),
        captcha: !hasCaptcha(),
        layoutTable: !hasLayoutTable(),
      } satisfies PageApplicabilityAbsent;
    },
    {
      captchaSource: CAPTCHA_TOKEN.source,
      matchesSrc: RUNTIME_MATCHES_SRC,
      collectSrc: BROWSER_COLLECT_CAPTCHA_SRC,
      matchSrc: BROWSER_CAPTCHA_MATCH_SRC,
    },
  );

  const observations: ApplicabilityObservation[] = [];

  if (absent.temporalMedia) {
    const fact = "No video, audio, or track elements in audited DOM.";
    for (const checkId of TEMPORAL_MEDIA_CHECK_IDS) {
      observations.push({ checkId, fact, url });
    }
  }
  if (absent.nontemporalMedia) {
    const fact = "No embed or canvas media elements in audited DOM.";
    for (const checkId of NONTEMPORAL_MEDIA_CHECK_IDS) {
      observations.push({ checkId, fact, url });
    }
  }
  if (absent.captcha) {
    observations.push({
      checkId: "captcha-alternative",
      fact: "No CAPTCHA challenge in audited DOM.",
      url,
    });
  }
  if (absent.layoutTable) {
    observations.push({
      checkId: "layout-table-linearization",
      fact: "No layout table without headers in audited DOM.",
      url,
    });
  }

  return observations;
}

/**
 * A check is site-level not_applicable only when every audited page confirms absence.
 */
export function aggregateApplicabilityObservations(
  pages: ReadonlyArray<{ applicabilityObservations?: ApplicabilityObservation[] }>,
): ReadonlyMap<CheckId, string> {
  if (pages.length === 0) return new Map();

  const counts = new Map<CheckId, number>();
  const facts = new Map<CheckId, string>();

  for (const page of pages) {
    for (const observation of page.applicabilityObservations ?? []) {
      counts.set(
        observation.checkId,
        (counts.get(observation.checkId) ?? 0) + 1,
      );
      if (!facts.has(observation.checkId)) {
        facts.set(observation.checkId, observation.fact);
      }
    }
  }

  const confirmed = new Map<CheckId, string>();
  for (const [checkId, count] of counts) {
    if (count === pages.length) {
      confirmed.set(checkId, facts.get(checkId) ?? "Criterion does not apply.");
    }
  }
  return confirmed;
}
