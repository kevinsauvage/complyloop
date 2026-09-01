import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { guidanceFor as rgaaGuidanceFor } from "@/adapters/rgaa/guidance";
import { rgaaPresets } from "@/adapters/rgaa/presets";
import { wcagFramework } from "@/adapters/wcag/controls";
import { wcagPresets } from "@/adapters/wcag/presets";
import type { CheckId } from "@/analysis/types";
import type { Control, Framework } from "@/core/project-types";
import type { CheckGuidance, FrameworkAdapter, FrameworkPreset } from "./types";

export const DEFAULT_CONNECT_PRESET_ID = "preset-rgaa-full";

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

export function allFrameworks(): Framework[] {
  return frameworkAdapters.map((adapter) => adapter.framework);
}

export function allControls(): Control[] {
  const byId = new Map<string, Control>();
  for (const adapter of frameworkAdapters) {
    for (const control of adapter.controls) {
      if (!byId.has(control.id)) byId.set(control.id, control);
    }
  }
  return [...byId.values()];
}

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

export function guidanceFor(checkId: CheckId): CheckGuidance {
  for (const adapter of frameworkAdapters) {
    if (adapter.guidanceFor) {
      return adapter.guidanceFor(checkId);
    }
  }
  throw new Error(`No guidance registered for check: ${checkId}`);
}

/**
 * Merges shipped adapter controls into an existing catalog without wiping
 * controls that are not part of a registered adapter.
 */
export function mergeAdapterControls(
  existingFrameworks: Framework[],
  existingControls: Control[],
): { frameworks: Framework[]; controls: Control[]; changed: boolean } {
  let changed = false;
  const frameworks = [...existingFrameworks];
  const controls = [...existingControls];
  const controlIds = new Set(controls.map((control) => control.id));
  const frameworkIds = new Set(frameworks.map((framework) => framework.id));

  for (const adapter of frameworkAdapters) {
    if (!frameworkIds.has(adapter.framework.id)) {
      frameworks.push(adapter.framework);
      frameworkIds.add(adapter.framework.id);
      changed = true;
    }
    for (const control of adapter.controls) {
      if (!controlIds.has(control.id)) {
        controls.push(control);
        controlIds.add(control.id);
        changed = true;
        continue;
      }
      const existing = controls.find((candidate) => candidate.id === control.id);
      if (
        existing &&
        control.complianceWeight !== undefined &&
        existing.complianceWeight !== control.complianceWeight
      ) {
        existing.complianceWeight = control.complianceWeight;
        changed = true;
      }
    }
  }

  return { frameworks, controls, changed };
}