import { describe, expect, it } from "vitest";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { emptyDb } from "@complyloop/db/types";
import { testFinding } from "@/test-fixtures/finding";
import { createFinding, shouldResolveOpenFinding } from "./assessment-findings";

const project: Project = {
  id: "proj-1",
  name: "Demo",
  source: "github",
  createdAt: "2026-01-01T00:00:00.000Z",
  orgId: "org-1",
  runtimeBaseUrl: "https://app.example",
  runtimeRoutes: ["/"],
};

describe("createFinding analyzer evidence", () => {
  it("persists analyzer fields on the finding and evidence detail", () => {
    const db = emptyDb();
    db.projects.push(project);

    createFinding(db, project, "/tmp", "ctl-markup-validity", "assessment-1", {
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
      engine: "runtime",
      analyzerId: "html-validate",
      analyzerRuleId: "element-permitted-order",
      analyzerVersion: "11.12.0",
      validationInput: "live-dom-serialization",
      validationRules: ["element-permitted-content", "close-order"],
      doctypeIncludedInInput: false,
      contributingAnalyzers: [{ analyzerId: "axe", analyzerRuleId: "list" }],
    });

    expect(db.findings[0]).toMatchObject({
      analyzerId: "html-validate",
      analyzerRuleId: "element-permitted-order",
      analyzerVersion: "11.12.0",
      contributingAnalyzers: [{ analyzerId: "axe", analyzerRuleId: "list" }],
    });
    expect(db.evidence[0]?.detail).toMatchObject({
      engine: "runtime",
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

describe("shouldResolveOpenFinding", () => {
  const domFinding = testFinding({
    engine: "runtime",
    location: {
      kind: "dom",
      url: "https://preview.example/",
      selector: "button",
      snippet: "<button></button>",
    },
  });

  const sourceFinding = testFinding({
    engine: "ast",
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
