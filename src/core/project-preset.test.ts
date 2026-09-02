import { describe, expect, it } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { projectDefaultPresetId } from "./project-preset";

const catalog = {
  isValidPresetId: (id: string) =>
    ["preset-rgaa-full", "preset-wcag-aa", "preset-wcag-full"].includes(id),
  defaultConnectPresetId: "preset-rgaa-full",
};

describe("projectDefaultPresetId", () => {
  it("uses the stored defaultPresetId when valid", () => {
    expect(
      projectDefaultPresetId(
        testProject({ defaultPresetId: "preset-wcag-aa" }),
        catalog,
      ),
    ).toBe("preset-wcag-aa");
  });

  it("falls back to the connect default when no preset is stored", () => {
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
