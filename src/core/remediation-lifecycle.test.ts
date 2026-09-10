import { describe, expect, it } from "vitest";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";

import {
  advanceRemediation,
  canBulkApproveRemediation,
  hasSafeDeterministicFix,
  refreshSuggestion,
} from "./remediation-lifecycle";

function remediation(status: Remediation["status"]): Remediation {
  return {
    id: "r1",
    findingId: "f1",
    status,
    suggestion: null,
    history: [{ status: "detected", at: "2026-01-01T00:00:00.000Z" }],
  };
}

const suggestion: RemediationSuggestion = {
  description: "Add an alt attribute",
  proposedSnippet: '<img alt="…" />',
  provenance: "ai",
  confidence: "medium",
  model: "test-model",
};

describe("advanceRemediation", () => {
  it("follows the remediation lifecycle in order", () => {
    expect(
      advanceRemediation(remediation("detected"), "suggested").status,
    ).toBe("suggested");
    expect(
      advanceRemediation(remediation("suggested"), "approved").status,
    ).toBe("approved");
    expect(
      advanceRemediation(remediation("approved"), "implemented").status,
    ).toBe("implemented");
    expect(
      advanceRemediation(remediation("implemented"), "verified").status,
    ).toBe("verified");
  });

  it("appends a history entry on a valid transition", () => {
    const advanced = advanceRemediation(
      remediation("suggested"),
      "approved",
      "ok",
    );
    expect(advanced.status).toBe("approved");
    expect(advanced.history).toHaveLength(2);
    expect(advanced.history[1]).toMatchObject({
      status: "approved",
      note: "ok",
    });
  });

  it("rejects skipping stages or moving backwards", () => {
    expect(() =>
      advanceRemediation(remediation("detected"), "verified"),
    ).toThrow(/Invalid remediation transition/);
    expect(() =>
      advanceRemediation(remediation("suggested"), "implemented"),
    ).toThrow(/Invalid remediation transition/);
    expect(() =>
      advanceRemediation(remediation("approved"), "suggested"),
    ).toThrow(/Invalid remediation transition/);
    expect(() =>
      advanceRemediation(remediation("verified"), "detected"),
    ).toThrow(/Invalid remediation transition/);
  });
});

describe("refreshSuggestion", () => {
  it("advances detected → suggested with the new suggestion", () => {
    const updated = refreshSuggestion(
      remediation("detected"),
      suggestion,
      "Patch ready: Add an alt attribute",
    );
    expect(updated.status).toBe("suggested");
    expect(updated.suggestion).toEqual(suggestion);
    expect(updated.history.at(-1)).toMatchObject({
      status: "suggested",
      note: "Patch ready: Add an alt attribute",
    });
  });

  it("keeps suggested status and appends history when refreshing", () => {
    const base = {
      ...remediation("suggested"),
      suggestion: {
        description: "old",
        proposedSnippet: "old",
        provenance: "deterministic" as const,
      },
    };
    const updated = refreshSuggestion(
      base,
      suggestion,
      "AI suggestion refreshed: Add an alt attribute",
    );
    expect(updated.status).toBe("suggested");
    expect(updated.suggestion).toEqual(suggestion);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1]).toMatchObject({
      status: "suggested",
      note: "AI suggestion refreshed: Add an alt attribute",
    });
  });

  it("rejects refresh after approval", () => {
    expect(() =>
      refreshSuggestion(remediation("approved"), suggestion, "too late"),
    ).toThrow(/before approval/);
    expect(() =>
      refreshSuggestion(remediation("implemented"), suggestion, "too late"),
    ).toThrow(/before approval/);
    expect(() =>
      refreshSuggestion(remediation("verified"), suggestion, "too late"),
    ).toThrow(/before approval/);
  });
});

const sourceFinding: Finding = {
  id: "f1",
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "img-alt",
  status: "open",
  kind: "violation",
  severity: "serious",
  reason: "missing alt",
  confidence: "high",
  location: {
    kind: "source",
    filePath: "a.tsx",
    line: 1,
    column: 1,
    span: { start: 0, end: 1 },
    snippet: "<img />",
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const domFinding: Finding = {
  ...sourceFinding,
  location: {
    kind: "dom",
    url: "https://example.com/login",
    selector: "input#email",
    snippet: "<input id='email'>",
  },
};

describe("hasSafeDeterministicFix", () => {
  it("is true for a non-editable proposed fix", () => {
    expect(
      hasSafeDeterministicFix({
        ...sourceFinding,
        fix: {
          kind: "remove_attribute",
          attribute: "role",
          span: { start: 0, end: 1 },
        },
      }),
    ).toBe(true);
  });

  it("is false when a human must edit the inserted value", () => {
    expect(
      hasSafeDeterministicFix({
        ...sourceFinding,
        fix: {
          kind: "insert_attribute",
          attribute: "alt",
          value: "",
          editable: true,
          span: { start: 0, end: 1 },
        },
      }),
    ).toBe(false);
  });

  it("is false when there is no proposed fix", () => {
    expect(hasSafeDeterministicFix(sourceFinding)).toBe(false);
  });
});

describe("canBulkApproveRemediation", () => {
  it("allows bulk approve for open runtime findings with a suggestion", () => {
    expect(canBulkApproveRemediation(domFinding, "suggested")).toBe(true);
  });

  it("does not bulk approve source findings even when suggested", () => {
    expect(canBulkApproveRemediation(sourceFinding, "suggested")).toBe(false);
  });

  it("does not bulk approve resolved or non-suggested runtime findings", () => {
    expect(
      canBulkApproveRemediation(
        { ...domFinding, status: "resolved" },
        "suggested",
      ),
    ).toBe(false);
    expect(canBulkApproveRemediation(domFinding, "approved")).toBe(false);
  });
});
