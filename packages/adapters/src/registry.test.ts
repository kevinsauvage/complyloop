import { describe, expect, it } from "vitest";
import {
  allFrameworkPresets,
  defaultConnectPreset,
  presetById,
} from "./registry";
import { shippedCatalog } from "./catalog";

describe("framework adapter registry", () => {
  it("registers the RGAA and WCAG adapters against one unique control catalog", () => {
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
    expect(allFrameworkPresets().map((preset) => preset.id)).toEqual([
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
});
