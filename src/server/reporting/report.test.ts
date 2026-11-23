import { describe, expect, it, vi } from "vitest";

import { wcagFramework } from "@complyloop/analysis-core/catalog/wcag/controls";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { emptyWorkspaceSlice } from "@complyloop/db/types";

import {
  reportSampleProject,
  sampleReportInput,
} from "@/test-fixtures/report-input";

import { buildReportMarkdown } from "./report-markdown";

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

describe("buildReportMarkdown", () => {
  it("includes open findings with snippets and omits full requirements table", () => {
    const markdown = buildReportMarkdown(sampleReportInput());

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

    const markdown = buildReportMarkdown(input);

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

    const markdown = buildReportMarkdown(input);

    expect(markdown).toContain("### Findings by severity");
    expect(markdown).toContain("| Critical | 1 |");
    expect(markdown).toContain(
      "**Suggested change (ai):** Add an accessible name.",
    );
    expect(markdown).toContain(
      '```tsx\n<button aria-label="Close">…</button>\n```',
    );
  });

  it("notes a capped list and says so when nothing is open", () => {
    const capped = sampleReportInput();
    capped.findingCounts = { ...capped.findingCounts, open: 12 };
    expect(buildReportMarkdown(capped)).toContain(
      "_Showing the 1 most severe of 12 open findings._",
    );

    const clean = sampleReportInput();
    clean.findings = [];
    clean.remediations = [];
    clean.findingCounts = { ...clean.findingCounts, open: 0 };
    expect(buildReportMarkdown(clean)).toContain(
      "_No open findings — nothing to fix right now._",
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

    const markdown = buildReportMarkdown(input);
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
});

describe("reportInputForProject", () => {
  it("uses the project's assessment target framework, not frameworks[0]", () => {
    const db = emptyWorkspaceSlice();
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

    const input = reportInputForProject(db, db.projects[0]!, {
      findingCounts: { open: 0, resolved: 0, dismissed: 0 },
      evidenceTotal: 0,
      evidenceTruncated: false,
    });

    expect(input.framework.id).toBe(wcagFramework.id);
    expect(input.framework.name).toBe(wcagFramework.name);
  });
});
