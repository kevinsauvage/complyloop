import { describe, expect, it } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { projectDefaultPresetId } from "./project-preset";

describe("projectDefaultPresetId", () => {
  it("prefers defaultPresetId over legacy assessmentPresetId", () => {
    expect(
      projectDefaultPresetId(
        testProject({
          defaultPresetId: "preset-wcag-aa",
          assessmentPresetId: "preset-rgaa-full",
        }),
      ),
    ).toBe("preset-wcag-aa");
  });

  it("falls back to assessmentPresetId then connect default", () => {
    expect(
      projectDefaultPresetId(
        testProject({ assessmentPresetId: "preset-wcag-full" }),
      ),
    ).toBe("preset-wcag-full");
    expect(projectDefaultPresetId(testProject())).toBe("preset-rgaa-full");
  });
});
