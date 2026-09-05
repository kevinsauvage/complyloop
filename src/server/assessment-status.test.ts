import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@complyloop/adapters/rgaa/controls";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import type { Project, Requirement } from "@complyloop/domain/project-types";
import { testProject } from "@/test-fixtures/project";
import { emptyDb } from "./db";
import {
  assertAssessableCatalog,
  controlsInScope,
  findingsInScope,
  refreshRequirementStatuses,
  requirementsInScope,
} from "./assessment-status";

function project(partial: Partial<Project> & Pick<Project, "id">): Project {
  return testProject(partial);
}

describe("assessment scope filters", () => {
  it("keeps only in-scope requirements and findings for a custom subset", () => {
    const scoped = project({
      id: "p1",
      inScopeControlIds: ["ctl-img-alt"],
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

  it("uses live Full RGAA membership, not a stale stored snapshot", () => {
    const db = emptyDb();
    db.controls.push(...rgaaControls);
    const scoped = controlsInScope(
      db,
      project({
        id: "p1",
        defaultPresetId: "preset-rgaa-full",
        inScopeControlIds: ["ctl-img-alt"],
      }),
    );
    expect(scoped.map((control) => control.id)).toContain("ctl-video-caption");
    expect(scoped).toHaveLength(
      rgaaControls.filter((control) => control.code.startsWith("RGAA")).length,
    );
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
      orgId: "org-test",
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
      orgId: "org-test",
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
      orgId: "org-test",
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
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-table-headers")
        ?.status,
    ).toBe("passed");
  });
});

describe("refreshRequirementStatuses site-level", () => {
  it("does not pass site-level checks when fewer than two pages were audited", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-multiple-ways",
      frameworkId: rgaaFramework.id,
      code: "RGAA 12.1",
      secondaryCode: "WCAG 2.4.5",
      title: "Multiple ways to find pages",
      description: "Navigation mechanisms.",
      checkId: "multiple-ways",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", {
      runtimeRan: true,
      siteLevelChecksRan: false,
    });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-multiple-ways")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("passes site-level checks when two pages were audited and there are no findings", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-multiple-ways",
      frameworkId: rgaaFramework.id,
      code: "RGAA 12.1",
      secondaryCode: "WCAG 2.4.5",
      title: "Multiple ways to find pages",
      description: "Navigation mechanisms.",
      checkId: "multiple-ways",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", {
      runtimeRan: true,
      siteLevelChecksRan: true,
    });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-multiple-ways")
        ?.status,
    ).toBe("passed");
  });
});

describe("refreshRequirementStatuses heuristic", () => {
  it("does not pass a heuristic check when the AST scan found no pattern", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-image-of-text",
      frameworkId: rgaaFramework.id,
      code: "RGAA 1.8",
      secondaryCode: "WCAG 1.4.5",
      title: "Text is not presented as an image",
      description: "Heuristic.",
      checkId: "image-of-text",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-image-of-text")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("marks a heuristic check needs_review when it emitted a warning", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-image-of-text",
      frameworkId: rgaaFramework.id,
      code: "RGAA 1.8",
      secondaryCode: "WCAG 1.4.5",
      title: "Text is not presented as an image",
      description: "Heuristic.",
      checkId: "image-of-text",
    });
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
      controlId: "ctl-image-of-text",
      assessmentId: "a1",
      checkId: "image-of-text",
      status: "open",
      kind: "warning",
      severity: "moderate",
      confidence: "medium",
      reason: "background image may be text",
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

    refreshRequirementStatuses(db, "p1", { runtimeRan: false });

    expect(
      db.requirements.find((requirement) => requirement.controlId === "ctl-image-of-text")
        ?.status,
    ).toBe("needs_review");
  });
});

describe("refreshRequirementStatuses html-validate-owned", () => {
  it("does not pass markup-nesting when runtime ran but html-validate did not", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-markup-validity",
      frameworkId: rgaaFramework.id,
      code: "RGAA 8.2",
      secondaryCode: "WCAG 4.1.1",
      title: "Markup validity",
      description: "Valid HTML.",
      checkId: "markup-nesting",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", {
      runtimeRan: true,
      htmlValidateRan: false,
    });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-markup-validity")?.status,
    ).toBe("unable_to_verify");
  });
});

describe("refreshRequirementStatuses applicability-gated", () => {
  it("sets not_applicable when runtime confirmed no captcha on all pages", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-captcha-alternative",
      frameworkId: rgaaFramework.id,
      code: "RGAA 1.5",
      secondaryCode: "WCAG 1.1.1",
      title: "CAPTCHA alternative",
      description: "CAPTCHA.",
      checkId: "captcha-alternative",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", {
      runtimeRan: true,
      applicabilityFacts: new Map([
        [
          "captcha-alternative",
          "No CAPTCHA challenge in audited DOM.",
        ],
      ]),
    });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-captcha-alternative")
        ?.status,
    ).toBe("not_applicable");
  });

  it("does not pass captcha-alternative when applicability was not confirmed", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-captcha-alternative",
      frameworkId: rgaaFramework.id,
      code: "RGAA 1.5",
      secondaryCode: "WCAG 1.1.1",
      title: "CAPTCHA alternative",
      description: "CAPTCHA.",
      checkId: "captcha-alternative",
    });
    db.projects.push({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-test",
      createdAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", { runtimeRan: true });

    expect(
      db.requirements.find((r) => r.controlId === "ctl-captcha-alternative")
        ?.status,
    ).toBe("unable_to_verify");
  });

  it("still fails video-caption when a violation is open", () => {
    const db = emptyDb();
    db.frameworks.push(rgaaFramework);
    db.controls.push({
      id: "ctl-video-caption",
      frameworkId: rgaaFramework.id,
      code: "RGAA 4.3",
      secondaryCode: "WCAG 1.2.2",
      title: "Video captions",
      description: "Captions.",
      checkId: "video-caption",
    });
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
      engine: "runtime",
      fix: null,
      explanations: [],
      detectedAt: new Date().toISOString(),
    });

    refreshRequirementStatuses(db, "p1", {
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
  it("throws when the catalog was never seeded", () => {
    const db = emptyDb();
    const project = testProject({
      defaultPresetId: "preset-rgaa-full",
      inScopeControlIds: ["ctl-img-alt"],
    });
    db.projects.push(project);

    expect(() => assertAssessableCatalog(db, project)).toThrow(
      /Compliance catalog is not seeded/,
    );
  });
});
