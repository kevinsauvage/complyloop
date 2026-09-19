import { describe, expect, it } from "vitest";

import type { Finding } from "@complyloop/analysis-core/contract/entities";

import {
  compareFindingsBySeverity,
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "./finding-priority";

function finding(
  id: string,
  checkId: string,
  filePath: string,
  severity: Finding["severity"] = "serious",
): Finding {
  return {
    id,
    projectId: "p1",
    controlId: "ctl",
    assessmentId: "a1",
    checkId,
    status: "open",
    kind: "violation",
    severity,
    confidence: "high",
    reason: "fail",
    location: {
      kind: "source",
      filePath,
      line: 1,
      column: 1,
      snippet: "<x />",
      span: { start: 0, end: 1 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("list ordering", () => {
  it("orders critical findings before moderate ones", () => {
    const critical = finding("1", "img-alt", "a.tsx", "critical");
    const moderate = finding("2", "img-alt", "b.tsx", "moderate");
    const ordered = [moderate, critical].sort(compareFindingsBySeverity);
    expect(ordered.map((f) => f.id)).toEqual(["1", "2"]);
  });

  it("ignores clusters and control weights: severity decides, id breaks ties", () => {
    // A clustered minor finding sorts after a solo serious one — list order
    // is severity-first so SQL `ORDER BY severity_rank, id` agrees with it.
    const clusteredMinor = finding(
      "1",
      "img-alt",
      "components/Card.tsx",
      "minor",
    );
    const soloSerious = finding("2", "img-alt", "solo.tsx", "serious");
    const ordered = [clusteredMinor, soloSerious].sort(
      compareFindingsBySeverity,
    );
    expect(ordered.map((f) => f.id)).toEqual(["2", "1"]);
    const sameA = finding("3", "img-alt", "b.tsx", "serious");
    const sameB = finding("4", "img-alt", "a.tsx", "serious");
    expect(
      [sameB, sameA].sort(compareFindingsBySeverity).map((f) => f.id),
    ).toEqual(["3", "4"]);
  });
});

describe("unableToVerifyReason", () => {
  it("flags missing preview URL for runtime-only checks", () => {
    expect(
      unableToVerifyReason(
        { checkId: "color-contrast" },
        {},
        { isRuntimeOnlyCheck: true },
      ),
    ).toBe("needs_preview_url");
  });

  it("flags human-only controls", () => {
    expect(
      unableToVerifyReason(
        { checkId: null },
        { runtimeBaseUrl: "https://app.example.com" },
        { isRuntimeOnlyCheck: false },
      ),
    ).toBe("needs_human_review");
  });

  it("labels reasons in engineer language", () => {
    expect(unableToVerifyReasonLabel("needs_preview_url")).toMatch(
      /preview URL/i,
    );
    expect(unableToVerifyReasonLabel("needs_human_review")).toMatch(
      /human review/i,
    );
    expect(unableToVerifyReasonLabel("needs_pertinence_review")).toMatch(
      /Presence checked/i,
    );
    expect(unableToVerifyReasonLabel("needs_heuristic_review")).toMatch(
      /not a pass/i,
    );
  });

  it("uses pertinence copy for presence/pertinence twins", () => {
    expect(
      unableToVerifyReason(
        { checkId: null },
        {},
        { isRuntimeOnlyCheck: false, isPertinenceTwin: true },
      ),
    ).toBe("needs_pertinence_review");
  });

  it("uses heuristic copy when no suspicious pattern was found", () => {
    expect(
      unableToVerifyReason(
        { checkId: "pointer-gesture" },
        {},
        { isRuntimeOnlyCheck: false, isHeuristicCheck: true },
      ),
    ).toBe("needs_heuristic_review");
  });

  it("returns runtime_only_pending when a runtime-only check had a reachable preview", () => {
    expect(
      unableToVerifyReason(
        { checkId: "color-contrast" },
        { runtimeBaseUrl: "https://app.example.com" },
        { isRuntimeOnlyCheck: true },
      ),
    ).toBe("runtime_only_pending");
  });

  it("returns non_scorable for a scorable check with no preview and no runtime requirement", () => {
    expect(
      unableToVerifyReason(
        { checkId: "duplicate-id" },
        {},
        { isRuntimeOnlyCheck: false },
      ),
    ).toBe("non_scorable");
  });

  it("labels every reason without throw", () => {
    const reasons = [
      "needs_preview_url",
      "needs_human_review",
      "needs_pertinence_review",
      "needs_heuristic_review",
      "runtime_only_pending",
      "non_scorable",
    ] as const;
    for (const reason of reasons) {
      expect(unableToVerifyReasonLabel(reason).length).toBeGreaterThan(0);
    }
    expect(unableToVerifyReasonLabel("non_scorable")).toMatch(
      /review|exception/i,
    );
  });

  it("throws on an unhandled reason", () => {
    expect(() => unableToVerifyReasonLabel("bogus" as never)).toThrow(
      /Unhandled unable-to-verify reason/,
    );
  });
});
