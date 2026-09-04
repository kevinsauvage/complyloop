import { describe, expect, it } from "vitest";
import {
  deriveRequirementStatus,
  isStickyHumanDecision,
} from "./requirement-status";

describe("isStickyHumanDecision", () => {
  it("is false when the status was decided automatically", () => {
    expect(isStickyHumanDecision({ determination: "automated" })).toBe(false);
    expect(
      isStickyHumanDecision({
        determination: "automated",
        hasException: true,
        hasHumanPass: true,
      }),
    ).toBe(false);
  });

  it("is true for any human-decided status that is an exception or a pass", () => {
    expect(
      isStickyHumanDecision({
        determination: "human_review",
        hasException: true,
      }),
    ).toBe(true);
    expect(
      isStickyHumanDecision({
        determination: "human_review",
        hasHumanPass: true,
      }),
    ).toBe(true);
  });

  it("is false when a human reviewed but neither an exception nor a pass is set", () => {
    expect(
      isStickyHumanDecision({
        determination: "human_review",
        hasException: false,
        hasHumanPass: false,
      }),
    ).toBe(false);
  });
});

describe("deriveRequirementStatus", () => {
  it("returns the sticky current status for a human decision", () => {
    expect(
      deriveRequirementStatus({
        authority: "runtime_only",
        currentStatus: "passed",
        determination: "human_review",
        hasException: true,
        runtimeRan: false,
      }),
    ).toBe("passed");
  });

  it("defaults a sticky decision to unable_to_verify when no current status exists", () => {
    expect(
      deriveRequirementStatus({
        authority: "runtime_only",
        determination: "human_review",
        hasHumanPass: true,
      }),
    ).toBe("unable_to_verify");
  });

  it("fails on any open violation, before authority gates", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        openFindings: [{ kind: "violation" }],
      }),
    ).toBe("failed");
  });

  it("returns needs_review when there are only warnings", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        openFindings: [{ kind: "warning" }],
      }),
    ).toBe("needs_review");
  });

  it("keeps manual and heuristic controls unable_to_verify until a human decides", () => {
    expect(deriveRequirementStatus({ authority: "manual" })).toBe(
      "unable_to_verify",
    );
    expect(deriveRequirementStatus({ authority: "heuristic" })).toBe(
      "unable_to_verify",
    );
  });

  it("gates runtime_only on a successful rendered audit", () => {
    expect(deriveRequirementStatus({ authority: "runtime_only" })).toBe(
      "unable_to_verify",
    );
    expect(
      deriveRequirementStatus({ authority: "runtime_only", runtimeRan: true }),
    ).toBe("passed");
  });

  it("gates site_level on both runtime pages and site-level checks", () => {
    expect(deriveRequirementStatus({ authority: "site_level" })).toBe(
      "unable_to_verify",
    );
    expect(
      deriveRequirementStatus({
        authority: "site_level",
        runtimeRan: true,
        siteLevelChecksRan: false,
      }),
    ).toBe("unable_to_verify");
    expect(
      deriveRequirementStatus({
        authority: "site_level",
        runtimeRan: true,
        siteLevelChecksRan: true,
      }),
    ).toBe("passed");
  });

  it("passes standard and composition-sensitive checks when nothing is open", () => {
    expect(deriveRequirementStatus({ authority: "standard" })).toBe("passed");
    expect(
      deriveRequirementStatus({ authority: "composition_sensitive" }),
    ).toBe("passed");
  });

  it("throws on an unrecognized authority", () => {
    expect(() =>
      deriveRequirementStatus({ authority: "bogus" as never }),
    ).toThrow(/Unhandled check authority/);
  });
});
