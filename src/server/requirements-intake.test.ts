import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/project-types";
import type { Db } from "./db";
import {
  applyFrameworkPreset,
  CUSTOM_FRAMEWORK_ID,
  importChecklist,
  importCustomControl,
  parseChecklistText,
  setProjectScope,
} from "./requirements-intake";

function emptyDb(project: Project): Db {
  return {
    frameworks: [rgaaFramework],
    controls: [...rgaaControls],
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

describe("requirements intake", () => {
  const project: Project = {
    id: "p1",
    name: "demo",
    source: "github",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("imports a custom control without a check and scopes it in", () => {
    const db = emptyDb(project);
    const control = importCustomControl(db, project, {
      code: "CUST-1",
      title: "Privacy notice present",
      description: "Marketing pages must link to the privacy notice.",
    });
    expect(control.frameworkId).toBe(CUSTOM_FRAMEWORK_ID);
    expect(control.checkId).toBeNull();
    expect(project.inScopeControlIds).toBeUndefined();
    expect(db.requirements[0].status).toBe("unable_to_verify");
    expect(
      db.evidence.some((record) => record.kind === "requirements_imported"),
    ).toBe(true);
  });

  it("links a custom control to a known check id", () => {
    const db = emptyDb(project);
    project.inScopeControlIds = ["ctl-img-alt"];
    const control = importCustomControl(db, project, {
      code: "CUST-IMG",
      title: "Alt text",
      description: "Images need alt",
      checkId: "img-alt",
    });
    expect(control.checkId).toBe("img-alt");
    expect(project.inScopeControlIds).toContain(control.id);
    expect(
      db.evidence.some((record) =>
        record.summary.includes("check img-alt"),
      ),
    ).toBe(true);
  });

  it("rejects unknown check ids", () => {
    const db = emptyDb(project);
    expect(() =>
      importCustomControl(db, project, {
        code: "CUST-X",
        title: "Bad",
        description: "Bad",
        checkId: "not-a-real-check",
      }),
    ).toThrow(/Unknown check id/);
  });

  it("stores an explicit subset when not all controls are selected", () => {
    const db = emptyDb(project);
    setProjectScope(db, project, ["ctl-img-alt", "ctl-button-name"]);
    expect(project.inScopeControlIds).toEqual(["ctl-img-alt", "ctl-button-name"]);
  });

  it("clears the explicit list when every control is selected", () => {
    const db = emptyDb(project);
    project.inScopeControlIds = ["ctl-img-alt"];
    setProjectScope(
      db,
      project,
      rgaaControls.map((control) => control.id),
    );
    expect(project.inScopeControlIds).toBeUndefined();
  });

  it("rejects an empty scope", () => {
    const db = emptyDb(project);
    expect(() => setProjectScope(db, project, ["missing"])).toThrow(
      /At least one control must remain in scope/,
    );
  });

  it("parses and imports a multi-line checklist", () => {
    const db = emptyDb(project);
    const text = [
      "# comment",
      "CUST-1 | Privacy link | Pages link to privacy",
      "CUST-2 | Cookie banner | Banner is keyboard accessible | Audit §4",
    ].join("\n");
    expect(parseChecklistText(text)).toHaveLength(2);
    const controls = importChecklist(db, project, text);
    expect(controls).toHaveLength(2);
    expect(db.controls.filter((c) => c.frameworkId === CUSTOM_FRAMEWORK_ID)).toHaveLength(
      2,
    );
  });

  it("parses an optional check id column", () => {
    expect(
      parseChecklistText(
        "CUST-1 | Title | Description | Custom | img-alt",
      ),
    ).toEqual([
      {
        code: "CUST-1",
        title: "Title",
        description: "Description",
        secondaryCode: "Custom",
        checkId: "img-alt",
      },
    ]);
  });

  it("rejects invalid checklist lines", () => {
    expect(() => parseChecklistText("only-one-field")).toThrow(
      /Invalid checklist line/,
    );
    expect(() => parseChecklistText("| | |")).toThrow(/Incomplete checklist line/);
  });

  it("rejects an empty checklist import", () => {
    const db = emptyDb(project);
    expect(() => importChecklist(db, project, "# only comments")).toThrow(
      /Checklist is empty/,
    );
  });

  it("applies a framework preset", () => {
    const db = emptyDb(project);
    applyFrameworkPreset(db, project, "preset-images-media");
    expect(project.inScopeControlIds?.length).toBeGreaterThan(0);
    expect(
      db.evidence.some((record) =>
        record.summary.includes("Applied framework preset"),
      ),
    ).toBe(true);
  });

  it("rejects an unknown preset", () => {
    const db = emptyDb(project);
    expect(() => applyFrameworkPreset(db, project, "nope")).toThrow(
      /Unknown framework preset/,
    );
  });
});
