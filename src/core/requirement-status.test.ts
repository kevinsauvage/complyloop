import { describe, expect, it } from "vitest";
import {
  deriveRequirementStatus,
  isStickyHumanDecision,
} from "./requirement-status";

describe("deriveRequirementStatus — findings", () => {
  it("passes when there are no open findings", () => {
    expect(deriveRequirementStatus({ authority: "standard" })).toBe("passed");
  });

  it("fails when any open finding is a violation", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        openFindings: [{ kind: "warning" }, { kind: "violation" }],
      }),
    ).toBe("failed");
  });

  it("needs review when only warnings are open", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        openFindings: [{ kind: "warning" }],
      }),
    ).toBe("needs_review");
  });

  it("fails even when the runtime audit did not run", () => {
    expect(
      deriveRequirementStatus({
        authority: "runtime_only",
        openFindings: [{ kind: "violation" }],
        runtimeRan: false,
      }),
    ).toBe("failed");
  });
});

describe("deriveRequirementStatus — sticky human decisions", () => {
  it("keeps the recorded status when an exception is on record", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "not_applicable",
        determination: "human_review",
        hasException: true,
        openFindings: [{ kind: "violation" }],
      }),
    ).toBe("not_applicable");
  });

  it("keeps the recorded status when a human pass is on record", () => {
    expect(
      deriveRequirementStatus({
        authority: "manual",
        currentStatus: "passed",
        determination: "human_review",
        hasHumanPass: true,
      }),
    ).toBe("passed");
  });

  it("re-derives once the human decision is cleared", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "not_applicable",
        determination: "automated",
        hasException: false,
      }),
    ).toBe("passed");
  });

  it("does not treat an automated determination as sticky", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "passed",
        determination: "automated",
        hasException: true,
        openFindings: [{ kind: "violation" }],
      }),
    ).toBe("failed");
  });

  it("exposes the stickiness rule for callers building the input", () => {
    expect(
      isStickyHumanDecision({
        determination: "human_review",
        hasException: true,
        hasHumanPass: false,
      }),
    ).toBe(true);
    expect(
      isStickyHumanDecision({
        determination: "human_review",
        hasException: false,
        hasHumanPass: false,
      }),
    ).toBe(false);
    expect(
      isStickyHumanDecision({
        determination: "automated",
        hasException: true,
        hasHumanPass: false,
      }),
    ).toBe(false);
  });
});

describe("deriveRequirementStatus — check authority", () => {
  it("keeps manual controls unable_to_verify until a human decides", () => {
    expect(deriveRequirementStatus({ authority: "manual" })).toBe(
      "unable_to_verify",
    );
  });

  it("keeps runtime-only checks unable_to_verify until the runtime audit ran", () => {
    expect(
      deriveRequirementStatus({ authority: "runtime_only" }),
    ).toBe("unable_to_verify");
    expect(
      deriveRequirementStatus({ authority: "runtime_only", runtimeRan: false }),
    ).toBe("unable_to_verify");
  });

  it("passes runtime-only checks after the runtime audit ran clean", () => {
    expect(
      deriveRequirementStatus({ authority: "runtime_only", runtimeRan: true }),
    ).toBe("passed");
  });

  it("keeps site-level checks unable_to_verify unless site-level checks ran", () => {
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

  it("keeps heuristic checks unable_to_verify when the scan found nothing", () => {
    expect(deriveRequirementStatus({ authority: "heuristic" })).toBe(
      "unable_to_verify",
    );
  });

  it("passes composition-sensitive checks from a clean AST scan (CI semantics)", () => {
    expect(
      deriveRequirementStatus({ authority: "composition_sensitive" }),
    ).toBe("passed");
  });
});
