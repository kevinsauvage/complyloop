import { describe, expect, it } from "vitest";
import type { Project } from "@/core/project-types";
import { emptyDb } from "./db-store/types";
import { createFinding } from "./assessment-findings";

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
      confidence: "high",
      reason: "html-validate [element-permitted-order]: invalid nesting",
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
      contributingAnalyzers: [{ analyzerId: "axe", analyzerRuleId: "list" }],
    });
  });
});
