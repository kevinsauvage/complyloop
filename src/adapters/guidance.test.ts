import { describe, expect, it } from "vitest";
import type { CheckId } from "@/analysis/types";
import { allChecks } from "@/analysis/checks/registry";
import { guidanceFor } from "./registry";
import { guidanceFor as rgaaGuidanceFor } from "./rgaa/guidance";

const SAMPLE_CHECK_IDS: CheckId[] = [
  "img-alt",
  "list-structure",
  "meta-viewport",
  "autocomplete-valid",
  "form-error-association",
];

describe("guidance facade", () => {
  it("delegates to the registered adapter", () => {
    for (const checkId of SAMPLE_CHECK_IDS) {
      expect(guidanceFor(checkId)).toEqual(rgaaGuidanceFor(checkId));
    }
  });

  it("covers every registered AST check", () => {
    for (const check of allChecks) {
      const guidance = guidanceFor(check.id);
      expect(guidance.impact.length).toBeGreaterThan(10);
      expect(guidance.howToFix.length).toBeGreaterThan(10);
    }
  });
});
