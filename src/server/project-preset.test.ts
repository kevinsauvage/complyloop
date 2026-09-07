import { describe, expect, it } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { emptyDb } from "@complyloop/db/types";
import { setDefaultPreset } from "./project-preset";

function dbWithProject(project = testProject()) {
  return { ...emptyDb(), projects: [project] };
}

describe("setDefaultPreset", () => {
  it("sets defaultPresetId", () => {
    const project = testProject();
    const db = dbWithProject(project);
    const result = setDefaultPreset(db, project, "preset-wcag-aa");
    expect(result.changed).toBe(true);
    expect(project.defaultPresetId).toBe("preset-wcag-aa");
  });

  it("is a no-op when the default is unchanged", () => {
    const project = testProject({ defaultPresetId: "preset-wcag-aa" });
    const db = dbWithProject(project);
    const evidenceCount = db.evidence.length;
    const result = setDefaultPreset(db, project, "preset-wcag-aa");
    expect(result.changed).toBe(false);
    expect(db.evidence).toHaveLength(evidenceCount);
  });

  it("records evidence when the default changes", () => {
    const project = testProject();
    const db = dbWithProject(project);
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
    const db = dbWithProject(project);
    expect(() => setDefaultPreset(db, project, "nope")).toThrow(
      /Unknown framework preset/,
    );
  });
});
