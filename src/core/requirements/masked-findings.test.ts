import { describe, expect, it } from "vitest";

import type {
  Finding,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

import { maskedFindingDetail, stickyDecisionAt } from "./masked-findings";

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "req-1",
    projectId: "proj-1",
    controlId: "rgaa-1-1",
    status: "passed",
    determination: "human_review",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function finding(id: string): Finding {
  return {
    id,
    projectId: "proj-1",
    assessmentId: "assessment-1",
    controlId: "rgaa-1-1",
    checkId: "some-check",
    kind: "violation",
    severity: "major",
    confidence: "high",
    status: "open",
    reason: "x",
    location: { kind: "source", filePath: "src/a.tsx" },
    explanations: [],
    detectedAt: "2026-01-04T00:00:00.000Z",
    fix: undefined,
  } as unknown as Finding;
}

describe("stickyDecisionAt", () => {
  it("returns the exception timestamp when present", () => {
    expect(
      stickyDecisionAt(
        requirement({
          exception: {
            reason: "accepted_risk",
            note: "",
            at: "2026-01-02T00:00:00.000Z",
          },
        }),
      ),
    ).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns undefined for a non-sticky requirement", () => {
    expect(stickyDecisionAt(requirement())).toBeUndefined();
  });
});

describe("maskedFindingDetail", () => {
  it("reports the count only when a sticky decision hides later findings", () => {
    const detail = maskedFindingDetail(
      requirement({
        exception: {
          reason: "accepted_risk",
          note: "",
          at: "2026-01-02T00:00:00.000Z",
        },
      }),
      [finding("f1"), finding("f2")],
    );
    expect(detail).toEqual({ count: 2, since: "2026-01-02T00:00:00.000Z" });
  });

  it("returns undefined when no findings were detected after the decision", () => {
    expect(maskedFindingDetail(requirement(), [finding("f1")])).toBeUndefined();
  });
});
