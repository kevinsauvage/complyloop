import { describe, expect, it } from "vitest";

import type { CheckId } from "@complyloop/analysis-core/check-registry";
import { allChecks } from "@complyloop/analysis-core/checks/registry";
import { jsxA11yMappedCheckIds } from "@complyloop/analysis-core/jsx-a11y-map";

import { guidanceFor } from "./guidance";

const SAMPLE_CHECK_IDS: CheckId[] = [
  "img-alt",
  "list-structure",
  "meta-viewport",
  "autocomplete-valid",
  "form-error-association",
];

describe("guidanceFor", () => {
  it("returns impact and how-to-fix copy for known checks", () => {
    for (const checkId of SAMPLE_CHECK_IDS) {
      const guidance = guidanceFor(checkId);
      expect(guidance.impact.length).toBeGreaterThan(10);
      expect(guidance.howToFix.length).toBeGreaterThan(10);
    }
  });

  it("covers every registered AST check", () => {
    for (const check of allChecks) {
      const guidance = guidanceFor(check.id);
      expect(guidance.impact.length).toBeGreaterThan(10);
      expect(guidance.howToFix.length).toBeGreaterThan(10);
    }
  });

  it("covers every jsx-a11y mapped check", () => {
    for (const checkId of jsxA11yMappedCheckIds()) {
      const guidance = guidanceFor(checkId);
      expect(guidance.impact.length).toBeGreaterThan(10);
      expect(guidance.howToFix.length).toBeGreaterThan(10);
    }
  });

  it("covers newer list and viewport guidance", () => {
    expect(guidanceFor("list-structure").howToFix).toMatch(/<ul>/);
    expect(guidanceFor("meta-viewport").howToFix).toMatch(/user-scalable/);
    expect(guidanceFor("autocomplete-valid").impact).toMatch(/1\.3\.5/);
  });
});
