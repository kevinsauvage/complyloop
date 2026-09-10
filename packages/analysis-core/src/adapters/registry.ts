import { rgaaPresets } from "./rgaa/presets.ts";
import { guidanceFor as rgaaGuidanceFor } from "./rgaa/guidance.ts";
import { wcagPresets } from "./wcag/presets.ts";
import type { CheckId } from "@complyloop/analysis-core/check-registry";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { CheckGuidance, FrameworkPreset } from "./types";

const DEFAULT_CONNECT_PRESET_ID = "preset-rgaa-full";

export const FRAMEWORK_PRESETS: readonly FrameworkPreset[] = [
  ...rgaaPresets,
  ...wcagPresets,
];

export function presetById(id: string): FrameworkPreset | undefined {
  return FRAMEWORK_PRESETS.find((preset) => preset.id === id);
}

export function defaultConnectPreset(): FrameworkPreset {
  const preset = presetById(DEFAULT_CONNECT_PRESET_ID);
  if (!preset) {
    throw new Error(`Missing connect preset: ${DEFAULT_CONNECT_PRESET_ID}`);
  }
  return preset;
}

export function isValidPresetId(id: string): boolean {
  return presetById(id) !== undefined;
}

/** Project default assessment preset id, else the connect default. */
export function projectDefaultPresetId(project: Project): string {
  const stored = project.defaultPresetId;
  if (stored && presetById(stored)) return stored;
  return defaultConnectPreset().id;
}

export function guidanceFor(checkId: CheckId): CheckGuidance {
  return rgaaGuidanceFor(checkId);
}
