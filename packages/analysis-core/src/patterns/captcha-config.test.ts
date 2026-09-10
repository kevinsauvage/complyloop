import { describe, expect, it } from "vitest";

import { collectCaptchaCandidates } from "../runtime/custom-checks/captcha-candidates.ts";
import {
  CAPTCHA_CANDIDATE_SELECTORS,
  CAPTCHA_COMPONENT_HOSTS,
  PUZZLE_HOST_NAMES,
} from "./captcha-config.ts";
import { CAPTCHA_COMPONENT_HOSTS as CRITERIA_HOSTS } from "./error-prevention-criteria.ts";
import { PUZZLE_HOSTS } from "./multilingual.ts";

describe("captcha-config parity", () => {
  it("component hosts are the single source", () => {
    expect([...CRITERIA_HOSTS]).toEqual([...CAPTCHA_COMPONENT_HOSTS]);
  });

  it("puzzle hosts match the multilingual set", () => {
    expect(new Set(PUZZLE_HOST_NAMES)).toEqual(PUZZLE_HOSTS);
  });

  it("DOM candidate selectors stay in sync with the page-injected collector", () => {
    const source = collectCaptchaCandidates.toString().toLowerCase();
    for (const selector of CAPTCHA_CANDIDATE_SELECTORS) {
      // Each comma-separated part must appear literally in the injected source.
      for (const part of selector.split(",").map((s) => s.trim())) {
        expect(source).toContain(part.toLowerCase());
      }
    }
    for (const host of PUZZLE_HOST_NAMES) {
      expect(source).toContain(host.toLowerCase());
    }
  });
});
