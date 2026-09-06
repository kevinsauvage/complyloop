import { rgaaControls, rgaaFramework } from "./rgaa/controls.ts";
import { guidanceFor as rgaaGuidanceFor } from "./rgaa/guidance.ts";
import { rgaaPresets } from "./rgaa/presets.ts";
import { wcagFramework } from "./wcag/controls.ts";
import { wcagPresets } from "./wcag/presets.ts";
import type { CheckId } from "@complyloop/analysis-core/types";
import type { PresetCatalog } from "@complyloop/analysis-core/contract/preset";
import type { CheckGuidance, FrameworkAdapter, FrameworkPreset } from "./types";

const DEFAULT_CONNECT_PRESET_ID = "preset-rgaa-full";

/** Adapter-backed PresetCatalog for core helpers — pass this into them. */
export const presetCatalog: PresetCatalog = {
  isValidPresetId: (id) => presetById(id) !== undefined,
  defaultConnectPresetId: DEFAULT_CONNECT_PRESET_ID,
};

/**
 * Registered framework adapters. RGAA and WCAG share one unique control
 * catalog (RGAA codes primary, WCAG on `secondaryCode`). Presets own the
 * assessment-target framework; WCAG does not re-register the same ids.
 */
const frameworkAdapters: readonly FrameworkAdapter[] = [
  {
    framework: rgaaFramework,
    controls: rgaaControls,
    presets: rgaaPresets,
    guidanceFor: rgaaGuidanceFor,
  },
  {
    framework: wcagFramework,
    controls: [],
    presets: wcagPresets,
  },
];

export function allFrameworkPresets(): FrameworkPreset[] {
  return frameworkAdapters.flatMap((adapter) => [...(adapter.presets ?? [])]);
}

export function presetById(id: string): FrameworkPreset | undefined {
  return allFrameworkPresets().find((preset) => preset.id === id);
}

export function defaultConnectPreset(): FrameworkPreset {
  const preset = presetById(DEFAULT_CONNECT_PRESET_ID);
  if (!preset) {
    throw new Error(`Missing connect preset: ${DEFAULT_CONNECT_PRESET_ID}`);
  }
  return preset;
}

export { isPertinenceTwinControl } from "./rgaa/pertinence-twins.ts";

export function guidanceFor(checkId: CheckId): CheckGuidance {
  for (const adapter of frameworkAdapters) {
    if (adapter.guidanceFor) {
      return adapter.guidanceFor(checkId);
    }
  }
  throw new Error(`No guidance registered for check: ${checkId}`);
}
