import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@complyloop/adapters/rgaa/controls";
import { wcagFramework } from "@complyloop/adapters/wcag/controls";
import { sampleReportInput, reportSampleProject } from "@/test-fixtures/report-input";
import { emptyDb } from "./db";
import {
  buildAuditReportMarkdown,
  buildEngineeringReportMarkdown,
  reportInputForProject,
} from "./report";

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
    expect(markdown).toContain("Critical / high");
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
      ...reportSampleProject,
      defaultPresetId: "preset-wcag-aa",
      inScopeControlIds: ["ctl-img-alt"],
    });
    db.requirements.push({
      id: "r1",
      projectId: reportSampleProject.id,
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
