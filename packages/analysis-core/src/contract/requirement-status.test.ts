import { describe, expect, it } from "vitest";

import {
  deriveRequirementStatus,
  hasViolationsSinceDecision,
  isStickyHumanDecision,
  stickyHumanDecisionHolds,
} from "./requirement-status";

const DECIDED_AT = "2026-03-01T12:00:00.000Z";
const BEFORE = "2026-02-01T00:00:00.000Z";
const AFTER = "2026-03-02T00:00:00.000Z";

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

describe("hasViolationsSinceDecision", () => {
  it("is true only for violations detected strictly after the decision", () => {
    expect(
      hasViolationsSinceDecision(
        [{ kind: "violation", detectedAt: AFTER }],
        DECIDED_AT,
      ),
    ).toBe(true);
    expect(
      hasViolationsSinceDecision(
        [{ kind: "violation", detectedAt: BEFORE }],
        DECIDED_AT,
      ),
    ).toBe(false);
    expect(
      hasViolationsSinceDecision(
        [{ kind: "violation", detectedAt: DECIDED_AT }],
        DECIDED_AT,
      ),
    ).toBe(false);
  });

  it("ignores warnings detected after the decision", () => {
    expect(
      hasViolationsSinceDecision(
        [{ kind: "warning", detectedAt: AFTER }],
        DECIDED_AT,
      ),
    ).toBe(false);
  });

  it("never re-arms without parseable timestamps", () => {
    expect(
      hasViolationsSinceDecision([{ kind: "violation" }], DECIDED_AT),
    ).toBe(false);
    expect(
      hasViolationsSinceDecision(
        [{ kind: "violation", detectedAt: "not-a-date" }],
        DECIDED_AT,
      ),
    ).toBe(false);
    expect(
      hasViolationsSinceDecision(
        [{ kind: "violation", detectedAt: AFTER }],
        undefined,
      ),
    ).toBe(false);
    expect(hasViolationsSinceDecision(undefined, DECIDED_AT)).toBe(false);
  });
});

describe("stickyHumanDecisionHolds", () => {
  it("holds for a sticky decision with only pre-decision findings", () => {
    expect(
      stickyHumanDecisionHolds({
        determination: "human_review",
        hasException: true,
        decisionAt: DECIDED_AT,
        openFindings: [{ kind: "violation", detectedAt: BEFORE }],
      }),
    ).toBe(true);
  });

  it("does not hold once a violation is detected after the decision", () => {
    expect(
      stickyHumanDecisionHolds({
        determination: "human_review",
        hasHumanPass: true,
        decisionAt: DECIDED_AT,
        openFindings: [{ kind: "violation", detectedAt: AFTER }],
      }),
    ).toBe(false);
  });

  it("never holds for an automated determination", () => {
    expect(
      stickyHumanDecisionHolds({
        determination: "automated",
        hasException: true,
        decisionAt: DECIDED_AT,
      }),
    ).toBe(false);
  });
});

describe("deriveRequirementStatus", () => {
  it("keeps a sticky pass over violations the decision already covered", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "passed",
        determination: "human_review",
        hasException: true,
        decisionAt: DECIDED_AT,
        openFindings: [{ kind: "violation", detectedAt: BEFORE }],
        audit: { filesScanned: 3 },
      }),
    ).toBe("passed");
  });

  it("re-arms a sticky pass to failed on a violation detected after the decision", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "passed",
        determination: "human_review",
        hasException: true,
        decisionAt: DECIDED_AT,
        openFindings: [
          { kind: "violation", detectedAt: BEFORE },
          { kind: "violation", detectedAt: AFTER },
        ],
        audit: { filesScanned: 3 },
      }),
    ).toBe("failed");
  });

  it("keeps a sticky pass when only warnings appear after the decision", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "passed",
        determination: "human_review",
        hasHumanPass: true,
        decisionAt: DECIDED_AT,
        openFindings: [{ kind: "warning", detectedAt: AFTER }],
        audit: { filesScanned: 3 },
      }),
    ).toBe("passed");
  });

  it("returns the sticky current status for a human decision", () => {
    expect(
      deriveRequirementStatus({
        authority: "runtime_only",
        currentStatus: "passed",
        determination: "human_review",
        hasException: true,
        audit: { runtimeRan: false },
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

  it("keeps the sticky verdict even with open violations underneath (surfaced separately, not re-derived)", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        currentStatus: "passed",
        determination: "human_review",
        hasException: true,
        openFindings: [{ kind: "violation" }],
      }),
    ).toBe("passed");
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
      deriveRequirementStatus({
        authority: "runtime_only",
        audit: { runtimeRan: true },
      }),
    ).toBe("passed");
  });

  it("gates site_level on both runtime pages and site-level checks", () => {
    expect(deriveRequirementStatus({ authority: "site_level" })).toBe(
      "unable_to_verify",
    );
    expect(
      deriveRequirementStatus({
        authority: "site_level",
        audit: { runtimeRan: true, siteLevelChecksRan: false },
      }),
    ).toBe("unable_to_verify");
    expect(
      deriveRequirementStatus({
        authority: "site_level",
        audit: { runtimeRan: true, siteLevelChecksRan: true },
      }),
    ).toBe("passed");
  });

  it("passes standard checks when files are scanned", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        audit: { filesScanned: 5 },
      }),
    ).toBe("passed");
  });

  it("returns unable_to_verify for standard checks when no files are scanned", () => {
    expect(
      deriveRequirementStatus({
        authority: "standard",
        audit: { filesScanned: 0 },
      }),
    ).toBe("unable_to_verify");
  });

  it("passes standard checks when nothing is open", () => {
    // No scan context must not default to passed.
    expect(deriveRequirementStatus({ authority: "standard" })).toBe(
      "unable_to_verify",
    );
    expect(
      deriveRequirementStatus({
        authority: "standard",
        audit: { filesScanned: 4 },
      }),
    ).toBe("passed");
  });

  it("returns not_applicable when runtime confirmed absence on all pages", () => {
    expect(
      deriveRequirementStatus({
        authority: "heuristic",
        audit: { runtimeRan: true, applicabilityConfirmed: true },
      }),
    ).toBe("not_applicable");
    expect(
      deriveRequirementStatus({
        authority: "standard",
        audit: { runtimeRan: true, applicabilityConfirmed: true },
      }),
    ).toBe("not_applicable");
  });

  it("keeps unable_to_verify for heuristic checks without applicability confirmation", () => {
    expect(
      deriveRequirementStatus({
        authority: "heuristic",
        audit: { runtimeRan: true },
      }),
    ).toBe("unable_to_verify");
  });

  it("does not apply not_applicable when open findings exist", () => {
    expect(
      deriveRequirementStatus({
        authority: "heuristic",
        audit: { runtimeRan: true, applicabilityConfirmed: true },
        openFindings: [{ kind: "violation" }],
      }),
    ).toBe("failed");
  });

  it("gates html-validate-owned checks on htmlValidateRan, not runtimeRan alone", () => {
    expect(
      deriveRequirementStatus({
        authority: "runtime_only",
        audit: {
          htmlValidateRequired: true,
          runtimeRan: true,
          htmlValidateRan: false,
        },
      }),
    ).toBe("unable_to_verify");
    expect(
      deriveRequirementStatus({
        authority: "runtime_only",
        audit: {
          htmlValidateRequired: true,
          runtimeRan: true,
          htmlValidateRan: true,
        },
      }),
    ).toBe("passed");
    expect(
      deriveRequirementStatus({
        authority: "standard",
        audit: { runtimeRan: true, htmlValidateRan: false, filesScanned: 2 },
      }),
    ).toBe("passed");
  });

  it("throws on an unrecognized authority", () => {
    expect(() =>
      deriveRequirementStatus({ authority: "bogus" as never }),
    ).toThrow(/Unhandled check authority/);
  });
});
