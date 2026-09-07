import { describe, expect, it } from "vitest";
import type { RawFinding } from "@complyloop/analysis-core/types";
import type { Finding } from "./types";

/**
 * Assignability canary (P2-2): a persisted `Finding` must stay constructible
 * from every `RawFinding` field plus the persistence-only fields. If the two
 * shapes drift (e.g. a new analyzer-provenance field is added to only one),
 * this construction fails to type-check.
 */
describe("Finding is constructible from RawFinding + persistence fields", () => {
  it("accepts every RawFinding field when spread into a persisted Finding", () => {
    const raw = {
      checkId: "button-name",
      kind: "violation",
      severity: "critical",
      confidence: "high",
      reason: "no accessible name",
      location: {
        kind: "source",
        filePath: "src/Button.tsx",
        line: 4,
        column: 3,
        snippet: "<button />",
        span: { start: 10, end: 20 },
      },
      fix: null,
      analyzerId: "jsx-a11y",
      analyzerRuleId: "button-has-type",
      analyzerVersion: "1.0.0",
      contributingAnalyzers: [],
    } satisfies RawFinding;

    const finding: Finding = {
      ...raw,
      id: "f1",
      projectId: "p1",
      controlId: "c1",
      assessmentId: "a1",
      status: "open",
      detectedAt: "2026-01-01T00:00:00.000Z",
      explanations: [],
    };

    expect(finding.checkId).toBe("button-name");
    expect(finding.analyzerId).toBe("jsx-a11y");
    expect(finding.location.kind).toBe("source");
  });

  it("accepts runtime provenance fields on a dom finding", () => {
    const raw = {
      checkId: "color-contrast",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "contrast below 4.5:1",
      location: {
        kind: "dom",
        url: "https://preview.example/",
        selector: "#nav",
        snippet: "<nav>…",
        elementLabel: "nav",
      },
      fix: null,
      analyzerId: "axe",
      analyzerRuleId: "color-contrast",
      contributingAnalyzers: [
        { analyzerId: "playwright-custom", analyzerRuleId: "color-contrast" },
      ],
    } satisfies RawFinding;

    const finding: Finding = {
      ...raw,
      id: "f2",
      projectId: "p1",
      controlId: "c2",
      assessmentId: "a2",
      status: "open",
      detectedAt: "2026-01-01T00:00:00.000Z",
      explanations: [],
    };

    expect(finding.analyzerId).toBe("axe");
    expect(finding.contributingAnalyzers).toHaveLength(1);
  });
});