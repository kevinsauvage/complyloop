import { describe, expect, it, vi } from "vitest";

import { wcagFramework } from "@complyloop/analysis-core/adapters/wcag/controls";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { emptyDb } from "@complyloop/db/types";

import {
  reportSampleProject,
  sampleReportInput,
} from "@/test-fixtures/report-input";

import {
  buildAuditReportMarkdown,
  buildEngineeringReportMarkdown,
} from "./report-markdown";

vi.mock("../workspace/workspace", () => ({
  getWorkspace: vi.fn(),
}));
vi.mock("../workspace/project-runtime", () => ({
  getProjectRuntime: vi.fn(),
}));

import {
  displayControl,
  frameworkForProject,
  reportInputForProject,
} from "./report";

describe("displayControl", () => {
  it("returns a themed control for a known catalog id", () => {
    const control = displayControl("ctl-img-alt", reportSampleProject);
    expect(control.id).toBe("ctl-img-alt");
    expect(control.code.length).toBeGreaterThan(0);
    expect(frameworkForProject(reportSampleProject).id).toBeTruthy();
  });

  it("throws for an unknown control id", () => {
    expect(() =>
      displayControl("ctl-does-not-exist", reportSampleProject),
    ).toThrow(/Unknown control/);
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
    expect(markdown).toContain("- **Severity:** Critical");
    expect(markdown).toContain("- **Confidence:** high");
    expect(markdown).not.toContain("## Requirements");
    expect(markdown).not.toContain("## Evidence trail");
  });

  it("renders snippets as fenced code blocks, immune to embedded fences", () => {
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

    // The fence is one backtick longer than the longest run in the snippet
    // (three), so the embedded fence cannot terminate the block early.
    expect(markdown).toContain(
      "````tsx\nconst s = `template with ``` inside`;\n````",
    );
    // Multiline reason is collapsed into the bullet.
    expect(markdown).toContain(
      "**Reason:** Template literal with a fence inside",
    );
    expect(markdown).not.toContain("Reason:** Template literal with a fence\n");
  });

  it("summarizes severity and renders the suggested fix as a fenced snippet", () => {
    const input = sampleReportInput();
    input.remediations[0] = {
      ...input.remediations[0],
      status: "suggested",
      suggestion: {
        description: "Add an accessible name.",
        proposedSnippet: '<button aria-label="Close">…</button>',
        provenance: "ai",
      },
    } as Remediation;

    const markdown = buildEngineeringReportMarkdown(input);

    expect(markdown).toContain("### Findings by severity");
    expect(markdown).toContain("| Critical | 1 |");
    expect(markdown).toContain(
      "**Suggested change (ai):** Add an accessible name.",
    );
    expect(markdown).toContain(
      '```tsx\n<button aria-label="Close">…</button>\n```',
    );
  });

  it("neutralizes markdown injection from finding content", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      reason:
        "### Hijacked heading\n[evil](https://evil.example) | table | `code`",
      location: {
        ...input.findings[0]!.location,
        filePath: "src/weird`file.tsx",
      },
    } as Finding;

    const markdown = buildEngineeringReportMarkdown(input);
    const lines = markdown.split("\n");

    // Newlines are collapsed, so the payload can never start a real heading
    // or table row — and link/table/code-span syntax is escaped.
    expect(markdown).not.toMatch(/^### Hijacked/m);
    expect(markdown).not.toMatch(/(^|[^\\])\[evil\]\(/);
    expect(markdown).not.toContain("`code`");
    expect(markdown).toContain("\\[evil](https://evil.example)");
    const tableLines = lines.filter((line) => line.includes("table"));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      expect(line).toContain("\\| table \\|");
      expect(line).not.toMatch(/(^|[^\\])\| table \|/);
    }
    // Backtick in the file path cannot break out of its code span.
    expect(markdown).toContain("weird'file.tsx");
    expect(markdown).not.toContain("`weird`");
  });

  it("neutralizes markdown injection from evidence summaries", () => {
    const input = sampleReportInput();
    input.evidence = [
      {
        ...input.evidence[0]!,
        summary: "Done | hacked | [evil](https://evil.example)",
      },
    ];

    const markdown = buildAuditReportMarkdown(input);
    const hackedLines = markdown
      .split("\n")
      .filter((line) => line.includes("hacked"));
    expect(hackedLines.length).toBeGreaterThan(0);
    for (const line of hackedLines) {
      expect(line).toContain("\\| hacked \\|");
      expect(line).not.toMatch(/(^|[^\\])\| hacked \|/);
    }
    expect(markdown).not.toMatch(/(^|[^\\])\[evil\]\(/);
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
