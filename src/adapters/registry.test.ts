import { describe, expect, it } from "vitest";
import {
  allControls,
  allFrameworkPresets,
  allFrameworks,
  defaultConnectPreset,
  mergeAdapterControls,
  presetById,
} from "./registry";

describe("framework adapter registry", () => {
  it("registers the RGAA and WCAG adapters against one unique control catalog", () => {
    const frameworkIds = allFrameworks().map((f) => f.id);
    expect(frameworkIds).toContain("fw-rgaa-4");
    expect(frameworkIds).toContain("fw-wcag-2-1");
    const controlIds = allControls().map((control) => control.id);
    expect(new Set(controlIds).size).toBe(controlIds.length);
    expect(controlIds).toContain("ctl-img-alt");
    expect(controlIds).toContain("ctl-video-caption");
    expect(controlIds).toContain("ctl-optgroup");
    expect(controlIds).toContain("ctl-img-alt-relevant");
    const automated = allControls().filter((control) => control.checkId !== null);
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
    expect(wcagFull).toContain("ctl-focus-appearance");
    expect(allFrameworkPresets().map((preset) => preset.id)).toEqual([
      "preset-rgaa-full",
      "preset-wcag-full",
      "preset-wcag-aa",
      "preset-wcag-aaa",
    ]);
  });

  it("merges new controls without wiping custom ones", () => {
    const custom = {
      id: "ctl-custom-x",
      frameworkId: "fw-custom",
      code: "CUST-1",
      secondaryCode: "Custom",
      title: "Custom",
      description: "Manual",
      checkId: null,
    };
    const merged = mergeAdapterControls([], [custom]);
    expect(merged.changed).toBe(true);
    expect(merged.controls.some((control) => control.id === "ctl-custom-x")).toBe(
      true,
    );
    expect(merged.controls.some((control) => control.id === "ctl-img-alt")).toBe(
      true,
    );
    expect(merged.controls.filter((control) => control.id === "ctl-img-alt")).toHaveLength(1);
  });

  it("resolves the default connect preset", () => {
    const preset = defaultConnectPreset();
    expect(preset.id).toBe("preset-rgaa-full");
    expect(preset.controlIds).toBeDefined();
  });

  it("returns a no-op merge when frameworks and controls are already registered unchanged", () => {
    const existing = allControls().filter((c) => c.id === "ctl-img-alt");
    const first = mergeAdapterControls(allFrameworks(), existing);
    const second = mergeAdapterControls(first.frameworks, first.controls);
    // The second merge adds nothing new.
    expect(second.controls).toHaveLength(first.controls.length);
    expect(second.changed).toBe(false);
  });

  it("marks a merge changed when a control's compliance weight is updated", () => {
    const existing = allControls().filter((c) => c.id === "ctl-img-alt");
    // Adapter ctl-img-alt ships a weight (1.4); a differing authored weight is
    // overwritten by the adapter's canonical value and flagged as changed.
    const withWeight = existing.map((c) => ({ ...c, complianceWeight: 5 }));
    const merged = mergeAdapterControls(allFrameworks(), withWeight);
    const mergedControl = merged.controls.find((c) => c.id === "ctl-img-alt");
    expect(mergedControl?.complianceWeight).toBe(1.4);
    expect(merged.changed).toBe(true);
  });
});