import { describe, expect, it } from "vitest";
import { presetById } from "@/adapters/registry";
import { rgaaControls, rgaaFramework } from "./controls";
import { rgaaPresets } from "./presets";

describe("rgaa presets", () => {
  it("exposes a single catalog target because RGAA has no A/AA/AAA levels", () => {
    expect(rgaaPresets.map((preset) => preset.id)).toEqual(["preset-rgaa-full"]);
    expect(rgaaPresets).toHaveLength(1);
    const [full] = rgaaPresets;
    expect(full?.frameworkId).toBe(rgaaFramework.id);
    expect(full?.name).not.toMatch(/\bAA{1,3}\b/);
    expect(presetById("preset-rgaa-full")?.controlIds).toHaveLength(
      rgaaControls.length,
    );
    expect(presetById("preset-rgaa-images-media")).toBeUndefined();
    expect(presetById("preset-forms-names")).toBeUndefined();
  });
});
