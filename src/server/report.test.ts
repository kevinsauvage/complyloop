import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type {
  Finding,
  Project,
  Remediation,
  Requirement,
} from "@/core/types";
import { buildComplianceReportMarkdown } from "./report";

const project: Project = {
  id: "p1",
  name: "demo-app",
  source: "github",
  sourceRef: "https://github.com/acme/demo-app",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("buildComplianceReportMarkdown", () => {
  it("includes summary, requirements, findings, and evidence for auditors", () => {
    const requirements: Requirement[] = rgaaControls.map((control, index) => ({
      id: `r${index}`,
      projectId: project.id,
      controlId: control.id,
      status: control.id === "ctl-img-alt" ? "failed" : "passed",
      determination: "automated",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    requirements[0] = {
      ...requirements[0],
      status: "not_applicable",
      determination: "human_review",
      exception: {
        reason: "not_applicable",
        note: "Marketing microsite excluded from scope",
        at: "2026-01-02T12:00:00.000Z",
      },
    };

    const findings: Finding[] = [
      {
        id: "f1",
        projectId: project.id,
        controlId: "ctl-button-name",
        assessmentId: "a1",
        checkId: "button-name",
        status: "open",
        kind: "violation",
        severity: "critical",
        confidence: "high",
        reason: "Button has no accessible name",
        location: {
          kind: "source",
          filePath: "Button.tsx",
          line: 4,
          column: 1,
          snippet: "<button><svg /></button>",
          span: { start: 0, end: 24 },
        },
        fix: null,
        explanations: [],
        detectedAt: "2026-01-02T00:00:00.000Z",
      },
    ];

    const remediations: Remediation[] = [
      {
        id: "rem1",
        findingId: "f1",
        status: "detected",
        suggestion: null,
        history: [],
      },
    ];

    const markdown = buildComplianceReportMarkdown({
      project,
      framework: rgaaFramework,
      controls: rgaaControls,
      requirements,
      findings,
      remediations,
      evidence: [
        {
          id: "e1",
          at: "2026-01-02T00:00:00.000Z",
          kind: "assessment_completed",
          summary: 'Assessment of "demo-app": 1 files scanned',
          projectId: project.id,
        },
      ],
      exportedAt: "2026-01-03T00:00:00.000Z",
    });

    expect(markdown).toContain("# Compliance report — demo-app");
    expect(markdown).toContain("| Failed |");
    expect(markdown).toContain("Not applicable");
    expect(markdown).toContain("Marketing microsite excluded from scope");
    expect(markdown).toContain("Button.tsx:4");
    expect(markdown).toContain("## Evidence trail");
    expect(markdown).toContain("assessment_completed");
  });
});
