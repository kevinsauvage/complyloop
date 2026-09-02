import type { Project } from "./project-types";

/**
 * Port over the preset catalog. Core must not import adapters
 * (docs/ai/architecture.md — module boundaries): the registry implements
 * this interface and callers pass it in.
 */
export interface PresetCatalog {
  /** True when the id names a registered framework preset. */
  isValidPresetId(id: string): boolean;
  /** Preset id used when a project has no valid stored default. */
  defaultConnectPresetId: string;
}

/** Project default assessment preset; falls back through legacy fields. */
export function projectDefaultPresetId(
  project: Project,
  catalog: PresetCatalog,
): string {
  const candidate = project.defaultPresetId ?? project.assessmentPresetId;
  if (candidate && catalog.isValidPresetId(candidate)) return candidate;
  return catalog.defaultConnectPresetId;
}
