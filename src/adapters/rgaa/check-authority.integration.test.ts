import { describe, expect, it } from "vitest";
import { rgaaControls } from "@/adapters/rgaa/controls";
import { authorityForCheck } from "@complyloop/analysis-core/check-authority";
import { deriveRequirementStatus } from "@complyloop/analysis-core/contract/requirement-status";

/**
 * Integration sweep: every control in the live catalog must map to an
 * authority class, and the derived status must respect the authority contract
 * for every class — an AST-only scan can never "pass" a check that needs the
 * rendered page or a human.
 */
const CHECKED = rgaaControls.filter(
  (control) => control.checkId !== null,
) as (typeof rgaaControls)[number][];

describe("check authority × RGAA catalog", () => {
  it("classifies every catalog check", () => {
    const classes = new Set(
      CHECKED.map((control) => authorityForCheck(control.checkId as string)),
    );
    // All classes are reachable from the live catalog; nothing falls through.
    expect([...classes].sort()).toEqual([
      "composition_sensitive",
      "heuristic",
      "runtime_only",
      "site_level",
      "standard",
    ]);
  });

  it("never passes an engine-dependent check from an AST-only scan", () => {
    for (const control of CHECKED) {
      const checkId = control.checkId as string;
      const authority = authorityForCheck(checkId);
      const status = deriveRequirementStatus({ authority });
      if (
        authority === "runtime_only" ||
        authority === "site_level" ||
        authority === "heuristic"
      ) {
        expect(status).toBe("unable_to_verify");
      } else {
        expect(status).toBe("passed");
      }
    }
  });

  it("passes runtime-dependent checks once their engine ran clean", () => {
    for (const control of CHECKED) {
      const authority = authorityForCheck(control.checkId as string);
      if (authority === "heuristic") continue; // heuristic needs a human, never auto-passes
      const status = deriveRequirementStatus({
        authority,
        runtimeRan: authority !== "standard" && authority !== "composition_sensitive",
        siteLevelChecksRan: true,
      });
      expect(status).toBe("passed");
    }
  });

  it("fails a requirement from an open violation regardless of authority", () => {
    for (const control of CHECKED) {
      const status = deriveRequirementStatus({
        authority: authorityForCheck(control.checkId as string),
        openFindings: [{ kind: "violation" }],
      });
      expect(status).toBe("failed");
    }
  });
});
