import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { wcagFramework } from "@/adapters/wcag/controls";
import type { Requirement } from "@/core/project-types";
import type { Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { testProject } from "@/test-fixtures/project";
import { emptyDb } from "./db";
import { buildAuditReportHtml } from "./report-html/audit";
import { buildEngineeringReportHtml } from "./report-html/engineering";
import {
  buildAuditReportMarkdown,
  buildEngineeringReportMarkdown,
  reportInputForProject,
} from "./report";

const project = testProject({
  name: "demo-app",
  sourceRef: "https://github.com/acme/demo-app",
});

function sampleReportInput() {
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

  return {
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
        kind: "assessment_completed" as const,
        summary: 'Assessment of "demo-app": 1 files scanned',
        projectId: project.id,
      },
    ],
    exportedAt: "2026-01-03T00:00:00.000Z",
  };
}

describe("buildAuditReportMarkdown", () => {
  it("includes summary, requirements, and human evidence labels for auditors", () => {
    const markdown = buildAuditReportMarkdown(sampleReportInput());

    expect(markdown).toContain("# Audit report — demo-app");
    expect(markdown).toContain("| Failed |");
    expect(markdown).toContain("Not applicable");
    expect(markdown).toContain("Marketing microsite excluded from scope");
    expect(markdown).toContain("## Evidence trail");
    expect(markdown).toContain("Assessment completed");
    expect(markdown).not.toContain("assessment_completed");
    expect(markdown).not.toContain("Button.tsx:4");
    expect(markdown).toContain("### RGAA 1.1 —");
    expect(markdown).toContain("- **WCAG:** WCAG 1.1.1");
  });

  it("labels controls with WCAG as primary when the assessment target is WCAG", () => {
    const input = sampleReportInput();
    input.framework = wcagFramework;

    const markdown = buildAuditReportMarkdown(input);

    expect(markdown).toContain(`**Framework:** ${wcagFramework.name}`);
    expect(markdown).toContain("### WCAG 1.1.1 —");
    expect(markdown).toContain("- **RGAA:** RGAA 1.1");
  });
});

describe("buildEngineeringReportMarkdown", () => {
  it("includes open findings with snippets and omits full requirements table", () => {
    const markdown = buildEngineeringReportMarkdown(sampleReportInput());

    expect(markdown).toContain("# Engineering report — demo-app");
    expect(markdown).toContain("## Open findings");
    expect(markdown).toContain("Button.tsx:4");
    expect(markdown).toContain("<button><svg /></button>");
    expect(markdown).not.toContain("## Requirements");
    expect(markdown).not.toContain("## Evidence trail");
  });
});

describe("reportInputForProject", () => {
  it("uses the project's assessment target framework, not frameworks[0]", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework, wcagFramework);
    db.controls.push(...rgaaControls);
    db.projects.push({
      ...project,
      defaultPresetId: "preset-wcag-aa",
      inScopeControlIds: ["ctl-img-alt"],
    });
    db.requirements.push({
      id: "r1",
      projectId: project.id,
      controlId: "ctl-img-alt",
      status: "passed",
      determination: "automated",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const input = reportInputForProject(db, db.projects[0]);

    expect(input.framework.id).toBe(wcagFramework.id);
    expect(input.framework.name).toBe(wcagFramework.name);
  });
});

describe("buildAuditReportHtml", () => {
  it("renders structured sections with styling and print affordances", () => {
    const html = buildAuditReportHtml(sampleReportInput());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Audit report — demo-app");
    expect(html).toContain('id="summary"');
    expect(html).toContain('id="requirements"');
    expect(html).toContain('id="evidence"');
    expect(html).not.toContain('id="findings"');
    expect(html).toContain("status-not-applicable");
    expect(html).toContain("Marketing microsite excluded from scope");
    expect(html).toContain("Assessment completed");
    expect(html).not.toContain("assessment_completed");
    expect(html).toContain("@media print");
    expect(html).toContain("window.print()");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("page-break-inside: avoid");
  });

  it("escapes HTML in user-controlled fields", () => {
    const input = sampleReportInput();
    input.project = {
      ...project,
      name: '<script>alert("x")</script>',
    };

    const html = buildAuditReportHtml(input);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildEngineeringReportHtml", () => {
  it("renders open findings with snippets and no requirements table", () => {
    const html = buildEngineeringReportHtml(sampleReportInput());

    expect(html).toContain("Engineering report — demo-app");
    expect(html).toContain('id="findings"');
    expect(html).toContain("Button.tsx:4");
    expect(html).toContain("&lt;button&gt;&lt;svg /&gt;&lt;/button&gt;");
    expect(html).toContain("severity-critical");
    expect(html).not.toContain('id="requirements"');
  });

  it("escapes HTML in finding reasons", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      reason: 'Reason with <img onerror="x">',
    };

    const html = buildEngineeringReportHtml(input);

    expect(html).toContain("&lt;img onerror=");
  });
});

describe("report-html empty states", () => {
  it("audit report shows placeholders when there is no evidence and no requirements", () => {
    const input = sampleReportInput();
    input.requirements = [];
    input.evidence = [];
    const html = buildAuditReportHtml(input);
    expect(html).toContain("No evidence records.");
    expect(html).toContain("No requirements recorded.");
    expect(html).toContain("0%"); // pass rate with zero requirements
  });

  it("engineering report shows placeholders when there are no open findings", () => {
    const input = sampleReportInput();
    input.findings = [];
    input.remediations = [];
    const html = buildEngineeringReportHtml(input);
    expect(html).toContain("No open findings.");
    expect(html).toContain("No shared root causes detected.");
  });

  it("engineering report lists clusters when open findings share a root cause", () => {
    const input = sampleReportInput();
    const second: Finding = {
      ...input.findings[0],
      id: "f2",
      location: {
        kind: "source",
        filePath: "Button.tsx",
        line: 22,
        column: 1,
        snippet: "<button><svg /></button>",
        span: { start: 0, end: 24 },
      },
    };
    input.findings = [input.findings[0], second];
    input.remediations = [
      { id: "rem1", findingId: "f1", status: "detected", suggestion: null, history: [] },
      { id: "rem2", findingId: "f2", status: "detected", suggestion: null, history: [] },
    ];

    const html = buildEngineeringReportHtml(input);

    expect(html).toContain("Shared root causes");
    expect(html).toContain("findings share");
    expect(html).toContain("class=\"cluster-list\"");
  });
});
