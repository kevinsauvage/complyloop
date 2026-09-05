import { describe, expect, it } from "vitest";
import { sampleReportInput } from "@/test-fixtures/report-input";
import { buildAuditReportHtml } from "./report-html/audit";
import { buildEngineeringReportHtml } from "./report-html/engineering";
import { buildAuditReportMarkdown } from "./report";
import { composeAuditReport, composeEngineeringReport } from "./report-model";

describe("report model composers", () => {
  it("labels evidence kinds once so markdown and HTML stay in sync", () => {
    const input = sampleReportInput();
    input.evidence.push({
      id: "e-kind",
      at: "2026-01-03T00:00:00.000Z",
      kind: "finding_detected",
      summary: "New finding recorded",
      projectId: input.project.id,
    });

    const model = composeAuditReport(input);
    expect(model.evidence.map((row) => row.kindLabel)).toEqual([
      "Finding detected",
      "Assessment completed",
    ]);

    const markdown = buildAuditReportMarkdown(input);
    const html = buildAuditReportHtml(input);
    expect(markdown).toContain("Finding detected");
    expect(markdown).not.toContain("finding_detected");
    expect(html).toContain("Finding detected");
    expect(html).not.toContain("finding_detected");
  });

  it("feeds engineering findings to both renderers from one model", () => {
    const model = composeEngineeringReport(sampleReportInput());
    expect(model.findings).toHaveLength(1);
    expect(model.findings[0]?.locationRef).toBe("Button.tsx:4");

    const html = buildEngineeringReportHtml(sampleReportInput());
    expect(html).toContain(model.findings[0]!.reason);
    expect(html).toContain(model.findings[0]!.locationRef);
  });

  it("falls back when a finding has no catalog control or remediation", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      controlId: "ctl-unknown",
      engine: "ast",
    };
    input.controls = [];
    input.requirements = [];
    input.remediations = [
      {
        id: "rem-ai",
        findingId: "f1",
        status: "suggested",
        suggestion: {
          provenance: "ai",
          description: "Add an accessible name",
          proposedSnippet: "<button>Save</button>",
          confidence: "medium",
        },
        history: [],
      },
    ];
    const model = composeEngineeringReport(input);
    expect(model.findings[0]?.code).toBe("ctl-unknown");
    expect(model.findings[0]?.requirementLine).toBeUndefined();
    expect(model.findings[0]?.engine).toBe("ast");
    expect(model.findings[0]?.suggestion?.provenance).toBe("ai");
  });

  it("includes evidence without a project id and github metadata on the header", () => {
    const input = sampleReportInput();
    input.project = {
      ...input.project,
      github: {
        fullName: "acme/demo-app",
        defaultBranch: "main",
        private: false,
      },
    };
    input.evidence.push({
      id: "e-global",
      at: "2026-01-04T00:00:00.000Z",
      kind: "project_connected",
      summary: "Connected",
    });
    const model = composeAuditReport(input);
    expect(model.header.githubFullName).toBe("acme/demo-app");
    expect(model.evidence.some((row) => row.summary === "Connected")).toBe(true);
  });

  it("labels a non-RGAA/WCAG secondary reference as Also", () => {
    const input = sampleReportInput();
    input.controls = [
      {
        ...input.controls[0],
        secondaryCode: "ISO 40500",
      },
    ];
    input.requirements = input.requirements.filter(
      (requirement) => requirement.controlId === input.controls[0]!.id,
    );
    const model = composeAuditReport(input);
    expect(model.requirements[0]?.secondaryLabel).toBe("Also");
  });
});
