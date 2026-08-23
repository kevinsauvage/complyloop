import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { rgaaPresets } from "@/adapters/rgaa/presets";
import type { Control, Framework } from "@/core/project-types";
import type { FrameworkAdapter, FrameworkPreset } from "./types";

/**
 * Registered framework adapters. RGAA/WCAG ships first; add SOC 2 / ISO /
 * custom packs here without changing seed or intake call sites.
 */
export const frameworkAdapters: readonly FrameworkAdapter[] = [
  {
    framework: rgaaFramework,
    controls: rgaaControls,
    presets: rgaaPresets,
  },
];

export function allFrameworks(): Framework[] {
  return frameworkAdapters.map((adapter) => adapter.framework);
}

export function allControls(): Control[] {
  return frameworkAdapters.flatMap((adapter) => [...adapter.controls]);
}

export function allFrameworkPresets(): FrameworkPreset[] {
  return frameworkAdapters.flatMap((adapter) => [...(adapter.presets ?? [])]);
}

export function presetById(id: string): FrameworkPreset | undefined {
  return allFrameworkPresets().find((preset) => preset.id === id);
}

/**
 * Merges shipped adapter controls into an existing catalog without wiping
 * custom (`fw-custom`) controls.
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
