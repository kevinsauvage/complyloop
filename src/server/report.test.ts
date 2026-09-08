import { describe, expect, it, vi } from "vitest";
import { wcagFramework } from "@complyloop/adapters/wcag/controls";
import type { Finding } from "@complyloop/db/types";
import { sampleReportInput, reportSampleProject } from "@/test-fixtures/report-input";
import { emptyDb } from "@complyloop/db/types";
import {
  buildAuditReportMarkdown,
  buildEngineeringReportMarkdown,
} from "./report-markdown";

vi.mock("./workspace", () => ({
  getWorkspace: vi.fn(),
}));
vi.mock("./project-runtime", () => ({
  getProjectRuntime: vi.fn(),
}));

import { displayControl, frameworkForProject, reportInputForProject } from "./report";

describe("displayControl", () => {
  it("returns a themed control for a known catalog id", () => {
    const control = displayControl("ctl-img-alt", reportSampleProject);
    expect(control.id).toBe("ctl-img-alt");
    expect(control.code.length).toBeGreaterThan(0);
    expect(frameworkForProject(reportSampleProject).id).toBeTruthy();
  });

  it("throws for an unknown control id", () => {
    expect(() => displayControl("ctl-does-not-exist", reportSampleProject)).toThrow(
      /Unknown control/,
    );
  });
});

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

  it("renders snippets as indented code blocks, immune to embedded fences", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      reason: "Template literal with a fence\ninside",
      location: {
        ...input.findings[0]!.location,
        snippet: "const s = `template with ``` inside`;",
      },
    } as Finding;

    const markdown = buildEngineeringReportMarkdown(input);

    // The snippet is preserved verbatim, indented as a code block, and the
    // embedded fence cannot terminate it early.
    expect(markdown).toContain("    const s = `template with ``` inside`;");
    // A raw fence line around the snippet would imply an unescaped block.
    expect(markdown).not.toMatch(/\n```\nconst s = /);
    // Multiline reason is collapsed into the bullet.
    expect(markdown).toContain("- **Reason:** Template literal with a fence inside");
    expect(markdown).not.toContain("Reason:** Template literal with a fence\n");
  });
});

describe("reportInputForProject", () => {
  it("uses the project's assessment target framework, not frameworks[0]", () => {
    const db = emptyDb();
    db.projects.push({
      ...reportSampleProject,
      defaultPresetId: "preset-wcag-aa",
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
