import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/types";
import type { Db } from "./db";
import {
  CUSTOM_FRAMEWORK_ID,
  importCustomControl,
  setProjectScope,
} from "./requirements-intake";

function emptyDb(project: Project): Db {
  return {
    frameworks: [rgaaFramework],
    controls: [...rgaaControls],
    projects: [project],
    activeProjectId: project.id,
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
  };
}

describe("requirements intake", () => {
  const project: Project = {
    id: "p1",
    name: "demo",
    rootPath: "/tmp/demo",
    source: "local",
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
});
