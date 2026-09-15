import { describe, expect, it } from "vitest";

import { presetById } from "../registry.ts";
import { rgaaControls, rgaaFramework } from "./controls";
import { rgaaPresets } from "./presets";

describe("rgaa presets", () => {
  it("exposes a single catalog target because RGAA has no A/AA/AAA levels", () => {
    expect(rgaaPresets.map((preset) => preset.id)).toEqual([
      "preset-rgaa-full",
    ]);
    expect(rgaaPresets).toHaveLength(1);
    const [full] = rgaaPresets;
    expect(full?.frameworkId).toBe(rgaaFramework.id);
    expect(full?.name).not.toMatch(/\bAA{1,3}\b/);
    expect(presetById("preset-rgaa-full")?.controlIds).toHaveLength(
      rgaaControls.filter((control) => control.code.startsWith("RGAA")).length,
    );
    expect(presetById("preset-rgaa-images-media")).toBeUndefined();
    expect(presetById("preset-forms-names")).toBeUndefined();
  });

  it("excludes WCAG-only additions from the RGAA catalog target", () => {
    const full = presetById("preset-rgaa-full");
    const ids = new Set(full?.controlIds);
    // WCAG-only controls (no RGAA equivalent) must not leak into RGAA scope
    for (const control of rgaaControls) {
      const inScope = ids.has(control.id);
      const isRgaaCoded = control.code.startsWith("RGAA");
      expect((isRgaaCoded && inScope) || (!isRgaaCoded && !inScope)).toBe(true);
    }
  });
});
