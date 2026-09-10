import type { CheckId } from "@complyloop/analysis-core/check-registry";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { guidanceFor as rgaaGuidanceFor } from "./rgaa/guidance.ts";
import { rgaaPresets } from "./rgaa/presets.ts";
import type { CheckGuidance, FrameworkPreset, FrameworkPresetSummary } from "./types";
import { wcagPresets } from "./wcag/presets.ts";

const DEFAULT_CONNECT_PRESET_ID = "preset-rgaa-full";

export const FRAMEWORK_PRESETS: readonly FrameworkPreset[] = [
  ...rgaaPresets,
  ...wcagPresets,
];

const PRESET_SUMMARIES: readonly FrameworkPresetSummary[] = Object.freeze(
  FRAMEWORK_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    frameworkId: preset.frameworkId,
    controlCount: preset.controlIds.length,
  })),
);

/**
 * Serializable preset list for client components. Omits `controlIds` so the
 * full catalog id list is not serialized into the RSC payload on `/settings`
 * and `/requirements` (preset rows only need the count).
 */
export function presetSummaries(): readonly FrameworkPresetSummary[] {
  return PRESET_SUMMARIES;
}

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
