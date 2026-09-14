import { describe, expect, it } from "vitest";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import {
  defaultConnectPreset,
  FRAMEWORK_PRESETS,
  isValidPresetId,
  presetById,
  projectDefaultPresetId,
} from "./registry";

function testProject(
  partial: Partial<Project> = {},
): Project {
  return {
    id: "p1",
    name: "test-project",
    source: "github",
    orgId: "org-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}
import { shippedCatalog } from "./catalog";

describe("framework presets and catalog", () => {
  it("registers RGAA and WCAG presets against one unique control catalog", () => {
    const { frameworks, controls } = shippedCatalog();
    const frameworkIds = frameworks.map((f) => f.id);
    expect(frameworkIds).toContain("fw-rgaa-4");
    expect(frameworkIds).toContain("fw-wcag-2-1");
    const controlIds = controls.map((control) => control.id);
    expect(new Set(controlIds).size).toBe(controlIds.length);
    expect(controlIds).toContain("ctl-img-alt");
    expect(controlIds).toContain("ctl-video-caption");
    expect(controlIds).toContain("ctl-optgroup");
    expect(controlIds).toContain("ctl-img-alt-relevant");
    const automated = controls.filter((control) => control.checkId !== null);
    const checkIds = automated.map((control) => control.checkId);
    expect(new Set(checkIds).size).toBe(checkIds.length);
    // RGAA Full is the RGAA-coded subset of the shared catalog; WCAG-only
    // additions (no RGAA equivalent) belong to the WCAG presets only.
    const rgaaFull = presetById("preset-rgaa-full")?.controlIds;
    const wcagFull = presetById("preset-wcag-full")?.controlIds;
    expect(rgaaFull).toBeDefined();
    expect(wcagFull).toBeDefined();
    expect(rgaaFull!.every((id) => wcagFull!.includes(id))).toBe(true);
    expect(rgaaFull).not.toEqual(wcagFull);
    expect(rgaaFull).not.toContain("ctl-focus-appearance");
    expect(rgaaFull).not.toContain("ctl-target-size-enhanced");
    expect(wcagFull).toContain("ctl-focus-appearance");
    expect(wcagFull).toContain("ctl-target-size-enhanced");
    expect(FRAMEWORK_PRESETS.map((preset) => preset.id)).toEqual([
      "preset-rgaa-full",
      "preset-wcag-full",
      "preset-wcag-aa",
      "preset-wcag-aaa",
    ]);
  });

  it("resolves the default connect preset", () => {
    const preset = defaultConnectPreset();
    expect(preset.id).toBe("preset-rgaa-full");
    expect(preset.controlIds).toBeDefined();
  });

  it("resolves the project default preset id with connect fallback", () => {
    expect(
      projectDefaultPresetId(
        testProject({ defaultPresetId: "preset-wcag-aa" }),
      ),
    ).toBe("preset-wcag-aa");
    expect(projectDefaultPresetId(testProject())).toBe("preset-rgaa-full");
    expect(
      projectDefaultPresetId(testProject({ defaultPresetId: "gone" })),
    ).toBe("preset-rgaa-full");
  });

  it("validates preset ids", () => {
    expect(isValidPresetId("preset-rgaa-full")).toBe(true);
    expect(isValidPresetId("preset-wcag-aaa")).toBe(true);
    expect(isValidPresetId("preset-gone")).toBe(false);
    expect(isValidPresetId("")).toBe(false);
  });
});
