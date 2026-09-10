import { afterEach,describe, expect, it, vi } from "vitest";

import * as registry from "@complyloop/analysis-core/adapters/registry";
import {
  rgaaControls,
  rgaaFramework,
} from "@complyloop/analysis-core/adapters/rgaa/controls";
import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type {
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import { emptyDb } from "@complyloop/db/types";

import { testControl } from "@/test-fixtures/control";
import { testProject } from "@/test-fixtures/project";

import {
  assertAssessableCatalog,
  controlsInScope,
  findingsInScope,
  requirementsInScope,
} from "../workspace/project-scope";
import { refreshRequirementStatuses } from "./assessment-status";

function project(partial: Partial<Project> & Pick<Project, "id">): Project {
  return testProject(partial);
}

afterEach(() => {
  vi.restoreAllMocks();
});

function applyRefresh(
  db: ReturnType<typeof emptyDb>,
  projectId: string,
  options: Parameters<typeof refreshRequirementStatuses>[0]["options"] = {},
  controlIds?: readonly string[],
) {
  const projectRow = db.projects.find(
    (candidate) => candidate.id === projectId,
  );
  if (!projectRow) throw new Error(`missing project ${projectId}`);
  const result = controlIds
    ? refreshRequirementStatuses({
        project: projectRow,
        findings: db.findings,
        requirements: db.requirements,
        controlIds,
        options,
      })
    : refreshRequirementStatuses({
        project: projectRow,
        findings: db.findings,
        requirements: db.requirements,
        options,
      });
  for (const requirement of result.requirements) {
    const index = db.requirements.findIndex((row) => row.id === requirement.id);
    if (index >= 0) db.requirements[index] = requirement;
    else db.requirements.push(requirement);
  }
  db.evidence.push(...result.evidence);
  return result;
}

describe("assessment scope filters", () => {
  it("keeps only in-scope requirements and findings for a preset", () => {
    vi.spyOn(registry, "presetById").mockReturnValue({
      id: "preset-test-img-alt",
      name: "Image alt only",
      description: "test preset",
      frameworkId: rgaaFramework.id,
      controlIds: ["ctl-img-alt"],
    });
    const scoped = project({
      id: "p1",
      defaultPresetId: "preset-test-img-alt",
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

  it("uses live Full RGAA membership from the preset", () => {
    const scoped = controlsInScope(
      project({
        id: "p1",
        defaultPresetId: "preset-rgaa-full",
      }),
    );
    expect(scoped.map((control) => control.id)).toContain("ctl-video-caption");
    expect(scoped).toHaveLength(
      rgaaControls.filter((control) => control.code.startsWith("RGAA")).length,
    );
  });
});

describe("refreshRequirementStatuses (targeted controlIds)", () => {
  it("re-derives only the requested controls", () => {
    const db = emptyDb();
    db.projects = [project({ id: "p1" })];
    const controls = [
      testControl({ id: "c1", checkId: "img-alt" }),
      testControl({ id: "c2", checkId: "button-name" }),
    ];
    db.requirements = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "c1",
        status: "failed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "r2",
        projectId: "p1",
        controlId: "c2",
        status: "failed",
        determination: "automated",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    applyRefresh(
      db,
      "p1",
      {
        runtimeRan: false,
        controls,
      },
      ["c1"],
    );

    expect(
      db.requirements.find((item) => item.controlId === "c1")?.status,
    ).toBe("passed");
    expect(
      db.requirements.find((item) => item.controlId === "c2")?.status,
    ).toBe("failed");
  });
});

describe("refreshRequirementStatuses runtime-only", () => {
  it("does not pass color-contrast when the runtime audit did not run", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-color-contrast",
      )?.status,
    ).toBe("unable_to_verify");
  });

  it("passes color-contrast when runtime ran and there are no findings", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-color-contrast",
      )?.status,
    ).toBe("passed");
  });

  it("does not pass axe-only controls when the runtime audit did not run", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-table-headers",
      )?.status,
    ).toBe("unable_to_verify");
  });

  it("passes axe-only controls when runtime ran and there are no findings", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-table-headers",
      )?.status,
    ).toBe("passed");
  });
});

describe("refreshRequirementStatuses site-level", () => {
  it("does not pass site-level checks when fewer than two pages were audited", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", {
      runtimeRan: true,
      siteLevelChecksRan: false,
    });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-multiple-ways",
      )?.status,
    ).toBe("unable_to_verify");
  });

  it("passes site-level checks when two pages were audited and there are no findings", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", {
      runtimeRan: true,
      siteLevelChecksRan: true,
    });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-multiple-ways",
      )?.status,
    ).toBe("passed");
  });
});

describe("refreshRequirementStatuses heuristic", () => {
  it("does not pass a heuristic check when the AST scan found no pattern", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-pointer-gesture",
      )?.status,
    ).toBe("unable_to_verify");
  });

  it("marks a heuristic check needs_review when it emitted a warning", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });
    db.findings.push({
      id: "f1",
      projectId: "p1",
      controlId: "ctl-pointer-gesture",
      assessmentId: "a1",
      checkId: "pointer-gesture",
      status: "open",
      kind: "warning",
      severity: "moderate",
      confidence: "medium",
      reason: "pointer gesture without keyboard equivalent",
      location: {
        kind: "source",
        filePath: "A.tsx",
        line: 1,
        column: 1,
        snippet: "<div />",
        span: { start: 0, end: 7 },
      },
      fix: null,
      explanations: [],
      detectedAt: "2026-01-01T00:00:00.000Z",
    });

    applyRefresh(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find(
        (requirement) => requirement.controlId === "ctl-pointer-gesture",
      )?.status,
    ).toBe("needs_review");
  });
});

describe("refreshRequirementStatuses html-validate-owned", () => {
  it("does not pass markup-nesting when runtime ran but html-validate did not", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", {
      runtimeRan: true,
      htmlValidateRan: false,
    });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-markup-validity")
        ?.status,
    ).toBe("unable_to_verify");
  });
});

describe("refreshRequirementStatuses applicability-gated", () => {
  it("sets not_applicable when runtime confirmed no captcha on all pages", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", {
      runtimeRan: true,
      applicabilityFacts: new Map([
        ["captcha-alternative", "No CAPTCHA challenge in audited DOM."],
      ]),
    });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-captcha-alternative")
        ?.status,
    ).toBe("not_applicable");
  });

  it("does not pass captcha-alternative when applicability was not confirmed", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-captcha-alternative")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("still fails video-caption when a violation is open", () => {
    const db = emptyDb();
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });
    db.findings.push({
      id: "f1",
      projectId: "p1",
      controlId: "ctl-video-caption",
      assessmentId: "a1",
      checkId: "video-caption",
      status: "open",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "Missing captions",
      location: {
        kind: "dom",
        url: "https://app/",
        selector: "video",
        snippet: "<video>",
      },
      analyzerId: "axe",
      fix: null,
      explanations: [],
      detectedAt: new Date().toISOString(),
    });

    applyRefresh(db, "p1", {
      runtimeRan: true,
      applicabilityFacts: new Map([
        ["video-caption", "No video, audio, or track elements in audited DOM."],
      ]),
    });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-video-caption")?.status,
    ).toBe("failed");
  });
});

describe("assertAssessableCatalog", () => {
  it("throws when the catalog is unavailable", () => {
    const project = testProject({
      defaultPresetId: "preset-rgaa-full",
    });

    expect(() => assertAssessableCatalog(project, [])).toThrow(
      /Compliance catalog is unavailable/,
    );
  });
});
