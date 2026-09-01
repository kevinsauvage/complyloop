import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/project-types";
import type { Db } from "./db";
import { navAttentionCounts } from "./nav-attention";

const project: Project = {
  id: "p1",
  name: "demo",
  source: "github",
  orgId: "org-test",
  sourceRef: "https://github.com/acme/demo",
  createdAt: new Date().toISOString(),
};

function emptyDb(): Db {
  return {
    frameworks: [rgaaFramework],
    controls: rgaaControls,
    organizations: [],
    memberships: [],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}

describe("navAttentionCounts", () => {
  it("counts open findings and unread alerts for the project", () => {
    const db = emptyDb();
    db.findings.push({
      id: "f1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      assessmentId: "a1",
      checkId: "img-alt",
      status: "open",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "missing alt",
      location: {
        kind: "source",
        filePath: "Hero.tsx",
        line: 1,
        column: 1,
        snippet: "<img />",
        span: { start: 0, end: 1 },
      },
      fix: null,
      explanations: [],
      detectedAt: new Date().toISOString(),
    });
    db.findings.push({
      id: "f2",
      projectId: "p1",
      controlId: "ctl-button-name",
      assessmentId: "a1",
      checkId: "button-name",
      status: "resolved",
      kind: "violation",
      severity: "moderate",
      confidence: "high",
      reason: "fixed",
      location: {
        kind: "source",
        filePath: "Btn.tsx",
        line: 1,
        column: 1,
        snippet: "<button />",
        span: { start: 0, end: 1 },
      },
      fix: null,
      explanations: [],
      detectedAt: new Date().toISOString(),
    });
    db.alerts.push(
      {
        id: "a-unread",
        projectId: "p1",
        kind: "compliance_regression",
        summary: "Regression",
        at: new Date().toISOString(),
        read: false,
      },
      {
        id: "a-read",
        projectId: "p1",
        kind: "compliance_regression",
        summary: "Old",
        at: new Date().toISOString(),
        read: true,
      },
    );

    expect(navAttentionCounts(db, "p1")).toEqual({
      openFindings: 1,
      unreadAlerts: 1,
    });
  });

  it("returns zero counts for an unknown project", () => {
    expect(navAttentionCounts(emptyDb(), "missing")).toEqual({
      openFindings: 0,
      unreadAlerts: 0,
    });
  });
});
