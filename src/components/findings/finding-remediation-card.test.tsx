import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Finding, Remediation } from "@/core/finding-types";
import { FindingRemediationCard } from "./finding-remediation-card";

vi.mock("./finding-action-panel", () => ({
  FindingActionPanel: () => null,
}));

vi.mock("@/server/actions/remediation-ai", () => ({
  generateAiRemediationAction: vi.fn(),
}));

const finding: Finding = {
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

const remediation: Remediation = {
  id: "r1",
  findingId: "f1",
  status: "suggested",
  suggestion: null,
  history: [],
};

describe("FindingRemediationCard", () => {
  it("marks the current lifecycle stage with aria-current=step", () => {
    render(
      <FindingRemediationCard
        finding={finding}
        remediation={remediation}
        canRemediate={false}
        aiAvailable={false}
      />,
    );

    expect(screen.getByText("Suggested")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("Detected")).not.toHaveAttribute("aria-current");
  });
});
