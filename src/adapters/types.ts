import type { Control, Framework } from "@/core/project-types";

export interface FrameworkPreset {
  id: string;
  name: string;
  description: string;
  frameworkId: string;
  controlIds: string[];
}

/**
 * A compliance framework packaged as controls (+ optional scope presets).
 * Add new frameworks under `src/adapters/<name>/` and register them in
 * `registry.ts` — seed + UI presets pick them up automatically.
 */
export interface FrameworkAdapter {
  framework: Framework;
  controls: readonly Control[];
  presets?: readonly FrameworkPreset[];
}
