import type { Finding } from "@complyloop/db/types";

/** Default open source finding for server/component tests. */
export function testFinding(partial: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    projectId: "p1",
    controlId: "ctl-img-alt",
    assessmentId: "a1",
    checkId: "img-alt",
    kind: "violation",
    status: "open",
    severity: "serious",
    confidence: "high",
    reason: "Missing alt",
    location: {
      kind: "source",
      filePath: "App.tsx",
      line: 1,
      column: 1,
      snippet: '<img src="x" />',
      span: { start: 0, end: 16 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}
