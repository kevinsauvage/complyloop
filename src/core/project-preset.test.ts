import { describe, expect, it } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { projectDefaultPresetId } from "./project-preset";

const catalog = {
  isValidPresetId: (id: string) =>
    ["preset-rgaa-full", "preset-wcag-aa", "preset-wcag-full"].includes(id),
  defaultConnectPresetId: "preset-rgaa-full",
};

describe("projectDefaultPresetId", () => {
  it("prefers defaultPresetId over legacy assessmentPresetId", () => {
    expect(
      projectDefaultPresetId(
        testProject({
          defaultPresetId: "preset-wcag-aa",
          assessmentPresetId: "preset-rgaa-full",
        }),
        catalog,
      ),
    ).toBe("preset-wcag-aa");
  });

  it("falls back to assessmentPresetId then connect default", () => {
    expect(
      projectDefaultPresetId(
        testProject({ assessmentPresetId: "preset-wcag-full" }),
        catalog,
      ),
    ).toBe("preset-wcag-full");
    expect(projectDefaultPresetId(testProject(), catalog)).toBe(
      "preset-rgaa-full",
    );
  });

  it("falls back to the connect default for unknown stored ids", () => {
    expect(
      projectDefaultPresetId(testProject({ defaultPresetId: "gone" }), catalog),
    ).toBe("preset-rgaa-full");
  });
});
