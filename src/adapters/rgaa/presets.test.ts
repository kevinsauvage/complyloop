import { describe, expect, it } from "vitest";
import { presetById } from "@/adapters/registry";
import { rgaaControls, rgaaFramework } from "./controls";
import { rgaaPresets } from "./presets";

describe("rgaa presets", () => {
  it("exposes Full, AA, and AAA level targets only", () => {
    expect(rgaaPresets.map((preset) => preset.id)).toEqual([
      "preset-rgaa-full",
      "preset-rgaa-aa",
      "preset-rgaa-aaa",
    ]);
    for (const preset of rgaaPresets) {
      expect(preset.frameworkId).toBe(rgaaFramework.id);
      expect(preset.controlIds.length).toBeGreaterThan(0);
    }
    expect(presetById("preset-rgaa-full")?.controlIds).toHaveLength(
      rgaaControls.length,
    );
    expect(presetById("preset-rgaa-images-media")).toBeUndefined();
    expect(presetById("preset-forms-names")).toBeUndefined();
  });
});
