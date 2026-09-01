import { describe, expect, it } from "vitest";
import { presetById } from "@/adapters/registry";
import { rgaaControls } from "@/adapters/rgaa/controls";
import { wcagFramework } from "./controls";
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
      rgaaControls.length,
    );
    expect(presetById("preset-wcag-images-media")).toBeUndefined();
  });

  it("uses WCAG 2.2 display labels while keeping preset ids", () => {
    expect(wcagFramework.id).toBe("fw-wcag-2-1");
    expect(wcagFramework.name).toBe("WCAG 2.2 (accessibility standard)");
    expect(presetById("preset-wcag-full")?.name).toBe("Full WCAG 2.2");
    expect(presetById("preset-wcag-aa")?.name).toBe("WCAG 2.2 AA");
    expect(presetById("preset-wcag-aaa")?.name).toBe("WCAG 2.2 extra checks");
    expect(presetById("preset-wcag-aaa")?.description).toBe(
      "AA plus extra heuristic checks; not WCAG AAA",
    );
  });
});
