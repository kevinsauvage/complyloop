import { describe, expect, it } from "vitest";
import { presetById } from "@/adapters/registry";
import { wcagControls, wcagFramework } from "./controls";
import { wcagPresets } from "./presets";

describe("wcag presets", () => {
  it("exposes Full, AA, and AAA level targets only", () => {
    expect(wcagPresets.map((preset) => preset.id)).toEqual([
      "preset-wcag-full",
      "preset-wcag-aa",
      "preset-wcag-aaa",
    ]);
    for (const preset of wcagPresets) {
      expect(preset.frameworkId).toBe(wcagFramework.id);
      expect(preset.controlIds.length).toBeGreaterThan(0);
    }
    expect(presetById("preset-wcag-full")?.controlIds).toHaveLength(
      wcagControls.length,
    );
    expect(presetById("preset-wcag-images-media")).toBeUndefined();
  });
});
