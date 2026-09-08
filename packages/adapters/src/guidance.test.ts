import { describe, expect, it } from "vitest";
import { allChecks } from "@complyloop/analysis-core/checks/registry";
import { guidanceFor } from "./registry";

describe("guidance facade", () => {
  it("covers every registered AST check", () => {
    for (const check of allChecks) {
      const guidance = guidanceFor(check.id);
      expect(guidance.impact.length).toBeGreaterThan(10);
      expect(guidance.howToFix.length).toBeGreaterThan(10);
    }
  });
});
