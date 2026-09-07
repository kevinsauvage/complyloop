import { describe, expect, it } from "vitest";
import { advanceRemediation, refreshSuggestion } from "./remediation";
import type { Remediation } from "@complyloop/db/types";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";

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
    expect(advanceRemediation(remediation("detected"), "suggested").status).toBe(
      "suggested",
    );
    expect(advanceRemediation(remediation("suggested"), "approved").status).toBe(
      "approved",
    );
    expect(advanceRemediation(remediation("approved"), "implemented").status).toBe(
      "implemented",
    );
    expect(
      advanceRemediation(remediation("implemented"), "verified").status,
    ).toBe("verified");
  });

  it("appends a history entry on a valid transition", () => {
    const advanced = advanceRemediation(remediation("suggested"), "approved", "ok");
    expect(advanced.status).toBe("approved");
    expect(advanced.history).toHaveLength(2);
    expect(advanced.history[1]).toMatchObject({ status: "approved", note: "ok" });
  });

  it("rejects skipping stages or moving backwards", () => {
    expect(() => advanceRemediation(remediation("detected"), "verified")).toThrow(
      /Invalid remediation transition/,
    );
    expect(() =>
      advanceRemediation(remediation("suggested"), "implemented"),
    ).toThrow(/Invalid remediation transition/);
    expect(() => advanceRemediation(remediation("approved"), "suggested")).toThrow(
      /Invalid remediation transition/,
    );
    expect(() => advanceRemediation(remediation("verified"), "detected")).toThrow(
      /Invalid remediation transition/,
    );
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
