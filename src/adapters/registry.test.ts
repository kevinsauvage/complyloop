import { describe, expect, it } from "vitest";
import {
  allControls,
  allFrameworkPresets,
  allFrameworks,
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
    expect(presetById("preset-rgaa-full")?.controlIds).toEqual(
      presetById("preset-wcag-full")?.controlIds,
    );
    expect(allFrameworkPresets().length).toBeGreaterThan(0);
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
    expect(
      merged.controls.filter((control) => control.id === "ctl-img-alt"),
    ).toHaveLength(1);
  });
});