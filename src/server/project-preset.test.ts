import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@complyloop/adapters/rgaa/controls";
import { testProject } from "@/test-fixtures/project";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { Db } from "./db";
import { setDefaultPreset } from "./project-preset";

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

describe("setDefaultPreset", () => {
  it("sets defaultPresetId", () => {
    const project = testProject();
    const db = emptyDb(project);
    const result = setDefaultPreset(db, project, "preset-wcag-aa");
    expect(result.changed).toBe(true);
    expect(project.defaultPresetId).toBe("preset-wcag-aa");
  });

  it("is a no-op when the default is unchanged", () => {
    const project = testProject({ defaultPresetId: "preset-wcag-aa" });
    const db = emptyDb(project);
    const evidenceCount = db.evidence.length;
    const result = setDefaultPreset(db, project, "preset-wcag-aa");
    expect(result.changed).toBe(false);
    expect(db.evidence).toHaveLength(evidenceCount);
  });

  it("records evidence when the default changes", () => {
    const project = testProject();
    const db = emptyDb(project);
    setDefaultPreset(db, project, "preset-wcag-aa");
    expect(
      db.evidence.some(
        (record) =>
          record.kind === "requirements_imported" &&
          record.summary.includes("Default assessment preset"),
      ),
    ).toBe(true);
  });

  it("rejects an unknown preset", () => {
    const project = testProject();
    const db = emptyDb(project);
    expect(() => setDefaultPreset(db, project, "nope")).toThrow(
      /Unknown framework preset/,
    );
  });
});
