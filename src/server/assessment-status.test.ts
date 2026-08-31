import { describe, expect, it } from "vitest";
import { rgaaFramework } from "@/adapters/rgaa/controls";
import type { Finding } from "@/core/finding-types";
import type { Project, Requirement } from "@/core/project-types";
import { emptyDb } from "./db";
import {
  findingsInScope,
  refreshRequirementStatuses,
  requirementsInScope,
} from "./assessment-status";

function project(partial: Partial<Project> & Pick<Project, "id">): Project {
  return {
    name: "App",
    source: "github",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("assessment scope filters", () => {
  it("keeps only in-scope requirements and findings when a preset is set", () => {
    const scoped = project({
      id: "p1",
      inScopeControlIds: ["ctl-img-alt"],
      assessmentPresetId: "preset-rgaa-aa",
    });
    const requirements: Requirement[] = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "ctl-img-alt",
        status: "failed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "r2",
        projectId: "p1",
        controlId: "ctl-button-name",
        status: "passed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "r3",
        projectId: "other",
        controlId: "ctl-img-alt",
        status: "failed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const findings: Finding[] = [
      {
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
          filePath: "A.tsx",
          line: 1,
          column: 1,
          snippet: "<img />",
          span: { start: 0, end: 7 },
        },
        fix: null,
        explanations: [],
        detectedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "f2",
        projectId: "p1",
        controlId: "ctl-button-name",
        assessmentId: "a1",
        checkId: "button-name",
        status: "open",
        kind: "violation",
        severity: "critical",
        confidence: "high",
        reason: "unnamed",
        location: {
          kind: "source",
          filePath: "B.tsx",
          line: 1,
          column: 1,
          snippet: "<button />",
          span: { start: 0, end: 10 },
        },
        fix: null,
        explanations: [],
        detectedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(requirementsInScope(requirements, scoped).map((r) => r.id)).toEqual([
      "r1",
    ]);
    expect(findingsInScope(findings, scoped).map((f) => f.id)).toEqual(["f1"]);
  });

  it("returns every project requirement when no scope is set", () => {
    const open = project({ id: "p1" });
    const requirements: Requirement[] = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "ctl-img-alt",
        status: "failed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "r2",
        projectId: "p1",
        controlId: "ctl-button-name",
        status: "passed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(requirementsInScope(requirements, open)).toHaveLength(2);
  });
});

describe("refreshRequirementStatuses runtime-only", () => {
  it("does not pass color-contrast when the runtime audit did not run", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-color-contrast",
      frameworkId: rgaaFramework.id,
      code: "WCAG 1.4.3",
      secondaryCode: "RGAA 3.2",
      title: "Text contrast meets 4.5:1",
      description: "Rendered contrast.",
      checkId: "color-contrast",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-color-contrast")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("passes color-contrast when runtime ran and there are no findings", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-color-contrast",
      frameworkId: rgaaFramework.id,
      code: "WCAG 1.4.3",
      secondaryCode: "RGAA 3.2",
      title: "Text contrast meets 4.5:1",
      description: "Rendered contrast.",
      checkId: "color-contrast",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-color-contrast")
        ?.status,
    ).toBe("passed");
  });

  it("does not pass axe-only controls when the runtime audit did not run", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-table-headers",
      frameworkId: rgaaFramework.id,
      code: "RGAA 5.1",
      secondaryCode: "WCAG 1.3.1",
      title: "Data tables have headers",
      description: "Rendered table headers.",
      checkId: "table-headers",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-table-headers")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("passes axe-only controls when runtime ran and there are no findings", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-table-headers",
      frameworkId: rgaaFramework.id,
      code: "RGAA 5.1",
      secondaryCode: "WCAG 1.3.1",
      title: "Data tables have headers",
      description: "Rendered table headers.",
      checkId: "table-headers",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-table-headers")
        ?.status,
    ).toBe("passed");
  });
});
