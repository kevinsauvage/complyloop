import { describe, expect, it } from "vitest";
import { rgaaFramework } from "./controls";
import { presetById, rgaaPresets } from "./presets";

describe("rgaa presets", () => {
  it("exposes curated presets for the RGAA framework", () => {
    expect(rgaaPresets.length).toBeGreaterThanOrEqual(4);
    for (const preset of rgaaPresets) {
      expect(preset.frameworkId).toBe(rgaaFramework.id);
      expect(preset.controlIds.length).toBeGreaterThan(0);
    }
  });

  it("resolves presets by id", () => {
    expect(presetById("preset-rgaa-full")?.name).toMatch(/Full RGAA/);
    expect(presetById("preset-forms-names")?.controlIds).toContain(
      "ctl-autocomplete-valid",
    );
    expect(presetById("preset-structure")?.controlIds).toEqual(
      expect.arrayContaining(["ctl-list-structure", "ctl-meta-viewport"]),
    );
    expect(presetById("missing-preset")).toBeUndefined();
  });
});
