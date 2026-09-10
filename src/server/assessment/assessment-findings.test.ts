import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProposedFix, SourceLocation } from "@complyloop/analysis-core/contract/finding-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { testFinding } from "@/test-fixtures/finding";

import type { ProjectRows } from "../workspace/project-rows";
import {
  buildSuggestion,
  createFinding,
  mergeFix,
  reconcileControlFindings,
  sameInstance,
  shouldResolveOpenFinding,
} from "./assessment-findings";

function emptyRows(): ProjectRows {
  return {
    findings: [],
    remediations: [],
    requirements: [],
    evidence: [],
  };
}

const project: Project = {
  id: "proj-1",
  name: "Demo",
  source: "github",
  createdAt: "2026-01-01T00:00:00.000Z",
  orgId: "org-1",
  runtimeBaseUrl: "https://app.example",
  runtimeRoutes: ["/"],
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sourceLoc(
  partial: Omit<SourceLocation, "kind" | "column" | "span"> &
    Partial<Pick<SourceLocation, "column" | "span">>,
): SourceLocation {
  return {
    kind: "source",
    column: partial.column ?? 1,
    span: partial.span ?? { start: 0, end: 1 },
    filePath: partial.filePath,
    line: partial.line,
    snippet: partial.snippet,
  };
}

describe("createFinding analyzer evidence", () => {
  it("persists analyzer fields on the finding and evidence detail", () => {
    const rows = emptyRows();

    createFinding(rows, project, "/tmp", "ctl-markup-validity", "assessment-1", {
      checkId: "markup-nesting",
      kind: "violation",
      severity: "moderate",
      confidence: "medium",
      reason:
        "Live DOM serialization (html-validate 11.12.0, not SSR/source HTML): [element-permitted-order] invalid nesting",
      location: {
        kind: "dom",
        url: "https://app.example/",
        selector: "table",
        snippet: "<table><td>x</td></table>",
      },
      fix: null,
      analyzerId: "html-validate",
      analyzerRuleId: "element-permitted-order",
      analyzerVersion: "11.12.0",
      validationInput: "live-dom-serialization",
      validationRules: ["element-permitted-content", "close-order"],
      doctypeIncludedInInput: false,
      contributingAnalyzers: [{ analyzerId: "axe", analyzerRuleId: "list" }],
    });

    expect(rows.findings[0]).toMatchObject({
      analyzerId: "html-validate",
      analyzerRuleId: "element-permitted-order",
      analyzerVersion: "11.12.0",
      contributingAnalyzers: [{ analyzerId: "axe", analyzerRuleId: "list" }],
    });
    expect(rows.evidence[0]?.detail).toMatchObject({
      analyzerId: "html-validate",
      analyzerRuleId: "element-permitted-order",
      analyzerVersion: "11.12.0",
      validationInput: "live-dom-serialization",
      validationRules: ["element-permitted-content", "close-order"],
      doctypeIncludedInInput: false,
      contributingAnalyzers: [{ analyzerId: "axe", analyzerRuleId: "list" }],
    });
  });
});

describe("reconcileControlFindings", () => {
  it("collapses duplicate DOM raw hits onto one open finding in a single pass", () => {
    const rows = emptyRows();
    const raw = {
      checkId: "color-contrast" as const,
      kind: "violation" as const,
      severity: "serious" as const,
      confidence: "high" as const,
      reason: "Low contrast",
      location: {
        kind: "dom" as const,
        url: "https://app.example/",
        selector: ".badge:nth-child(2)",
        snippet: '<span class="badge">JS</span>',
      },
      fix: null,
      analyzerId: "axe" as const,
      analyzerRuleId: "color-contrast",
    };

    reconcileControlFindings({
      rows,
      project,
      control: {
        id: "ctl-contrast",
        frameworkId: "rgaa",
        code: "RGAA 3.2",
        secondaryCode: "WCAG 1.4.3",
        title: "Contrast",
        description: "Contrast of text",
        checkId: "color-contrast",
      },
      assessmentId: "a1",
      rootPath: "/tmp",
      rawForControl: [raw, { ...raw }, { ...raw }],
      scopedFileSet: null,
      runtimeRan: true,
      onFindingResolved: () => {},
    });

    expect(
      rows.findings.filter((finding) => finding.status === "open"),
    ).toHaveLength(1);
  });
});

describe("shouldResolveOpenFinding", () => {
  const domFinding = testFinding({
    location: {
      kind: "dom",
      url: "https://preview.example/",
      selector: "button",
      snippet: "<button></button>",
    },
  });

  const sourceFinding = testFinding({
    location: {
      kind: "source",
      filePath: "Hero.tsx",
      line: 1,
      column: 1,
      snippet: "<img />",
      span: { start: 0, end: 7 },
    },
  });

  it("does not resolve a runtime finding when runtime did not run", () => {
    expect(
      shouldResolveOpenFinding({
        finding: domFinding,
        scopedFileSet: null,
        runtimeRan: false,
      }),
    ).toBe(false);
  });

  it("resolves a runtime finding only after a successful runtime audit", () => {
    expect(
      shouldResolveOpenFinding({
        finding: domFinding,
        scopedFileSet: null,
        runtimeRan: true,
      }),
    ).toBe(true);
  });

  it("keeps a source finding outside the scoped file set", () => {
    expect(
      shouldResolveOpenFinding({
        finding: sourceFinding,
        scopedFileSet: new Set(["Other.tsx"]),
        runtimeRan: false,
      }),
    ).toBe(false);
  });

  it("resolves a source finding in the scoped file set", () => {
    expect(
      shouldResolveOpenFinding({
        finding: sourceFinding,
        scopedFileSet: new Set(["Hero.tsx"]),
        runtimeRan: false,
      }),
    ).toBe(true);
  });
});

describe("sameInstance", () => {
  it("matches by snippet when lines differ", () => {
    expect(
      sameInstance(
        { location: sourceLoc({ filePath: "App.tsx", line: 10, snippet: '<img src="x" />' }) },
        { location: sourceLoc({ filePath: "App.tsx", line: 99, snippet: '<img src="x" />' }) },
      ),
    ).toBe(true);
  });

  it("matches by line when snippets differ", () => {
    expect(
      sameInstance(
        { location: sourceLoc({ filePath: "App.tsx", line: 4, snippet: "old" }) },
        { location: sourceLoc({ filePath: "App.tsx", line: 4, snippet: "new" }) },
      ),
    ).toBe(true);
  });

  it("rejects different files", () => {
    expect(
      sameInstance(
        { location: sourceLoc({ filePath: "A.tsx", line: 1, snippet: "x" }) },
        { location: sourceLoc({ filePath: "B.tsx", line: 1, snippet: "x" }) },
      ),
    ).toBe(false);
  });

  it("matches DOM findings by url and selector", () => {
    expect(
      sameInstance(
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "#email",
            snippet: "<input>",
          },
        },
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "#email",
            snippet: "<input id=email>",
          },
        },
      ),
    ).toBe(true);
  });

  it("does not match distinct DOM nodes that share a snippet", () => {
    expect(
      sameInstance(
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "#a",
            snippet: "<span class=\"muted\">Ok</span>",
          },
        },
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "#b",
            snippet: "<span class=\"muted\">Ok</span>",
          },
        },
      ),
    ).toBe(false);
  });

  it("falls back to snippet when a DOM selector is unknown", () => {
    expect(
      sameInstance(
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "(unknown)",
            snippet: "<button>Save</button>",
          },
        },
        {
          location: {
            kind: "dom",
            url: "https://x.test/",
            selector: "(unknown)",
            snippet: "<button>Save</button>",
          },
        },
      ),
    ).toBe(true);
  });
});

describe("mergeFix", () => {
  const fresh: ProposedFix = {
    kind: "insert_attribute",
    attribute: "alt",
    value: "scanned",
    editable: true,
    span: { start: 1, end: 2 },
  };

  it("preserves an editable human-edited attribute value", () => {
    const existing: ProposedFix = {
      kind: "insert_attribute",
      attribute: "alt",
      value: "human",
      editable: true,
      span: { start: 0, end: 1 },
    };
    expect(mergeFix(existing, fresh)).toEqual({ ...fresh, value: "human" });
  });

  it("returns the fresh fix when the existing value is not editable", () => {
    const existing: ProposedFix = {
      kind: "insert_attribute",
      attribute: "alt",
      value: "human",
      editable: false,
      span: { start: 0, end: 1 },
    };
    expect(mergeFix(existing, fresh)).toEqual(fresh);
  });

  it("returns the fresh fix when either side is null", () => {
    expect(mergeFix(null, fresh)).toEqual(fresh);
    expect(mergeFix(fresh, null)).toBeNull();
  });
});

describe("buildSuggestion", () => {
  it("returns null when there is no fix", () => {
    expect(
      buildSuggestion("/tmp", {
        location: sourceLoc({ filePath: "App.tsx", line: 1, snippet: "x" }),
        fix: null,
      }),
    ).toBeNull();
  });

  it("builds a deterministic suggestion from the current file text", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "suggest-"));
    tempDirs.push(root);
    const filePath = "App.tsx";
    fs.writeFileSync(
      path.join(root, filePath),
      '<img src="/x.png" />\n',
      "utf8",
    );

    const suggestion = buildSuggestion(root, {
      location: sourceLoc({
        filePath,
        line: 1,
        snippet: '<img src="/x.png" />',
        span: { start: 0, end: 20 },
      }),
      fix: {
        kind: "insert_attribute",
        attribute: "alt",
        value: "",
        editable: true,
        span: { start: 4, end: 4 },
      },
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.provenance).toBe("deterministic");
    expect(suggestion?.confidence).toBe("high");
    expect(suggestion?.description.length).toBeGreaterThan(0);
    expect(suggestion?.proposedSnippet).toContain("alt");
  });
});
