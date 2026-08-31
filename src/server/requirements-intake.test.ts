import { describe, expect, it } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { rgaaPresets } from "@/adapters/rgaa/presets";
import type { Project } from "@/core/project-types";
import type { Db } from "./db";
import { applyFrameworkPreset } from "./requirements-intake";

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

function demoProject(): Project {
  return {
    id: "p1",
    name: "demo",
    source: "github",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("applyFrameworkPreset", () => {

  const aa = rgaaPresets.find((preset) => preset.id === "preset-rgaa-aa");
  const full = rgaaPresets.find((preset) => preset.id === "preset-rgaa-full");
  if (!aa || !full) throw new Error("Expected RGAA level presets");

  it("sets the assessment target and replaces any previous scope", () => {
    const project = demoProject();
    const db = emptyDb(project);
    const first = applyFrameworkPreset(db, project, "preset-rgaa-aa");
    expect(first.changed).toBe(true);
    expect(project.assessmentPresetId).toBe("preset-rgaa-aa");
    expect(project.inScopeControlIds).toEqual(aa.controlIds);

    const second = applyFrameworkPreset(db, project, "preset-rgaa-full");
    expect(second.changed).toBe(true);
    expect(project.assessmentPresetId).toBe("preset-rgaa-full");
    expect(project.inScopeControlIds).toEqual(full.controlIds);
    expect(project.inScopeControlIds).toHaveLength(rgaaControls.length);
  });

  it("is a no-op when the same target is already selected", () => {
    const project = demoProject();
    const db = emptyDb(project);
    applyFrameworkPreset(db, project, "preset-rgaa-aa");
    const evidenceCount = db.evidence.length;
    const result = applyFrameworkPreset(db, project, "preset-rgaa-aa");
    expect(result.changed).toBe(false);
    expect(db.evidence).toHaveLength(evidenceCount);
  });

  it("records evidence when the target changes", () => {
    const project = demoProject();
    const db = emptyDb(project);
    applyFrameworkPreset(db, project, "preset-rgaa-aa");
    expect(
      db.evidence.some(
        (record) =>
          record.kind === "requirements_imported" &&
          record.summary.includes("RGAA 4 AA"),
      ),
    ).toBe(true);
  });

  it("rejects an unknown preset", () => {
    const project = demoProject();
    const db = emptyDb(project);
    expect(() => applyFrameworkPreset(db, project, "nope")).toThrow(
      /Unknown framework preset/,
    );
  });
});
