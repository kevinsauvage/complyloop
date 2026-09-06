import type { Project } from "@complyloop/analysis-core/contract/project-types";
import type { PresetCatalog } from "@complyloop/analysis-core/contract/preset";

export type { PresetCatalog } from "@complyloop/analysis-core/contract/preset";

/** Project default assessment preset, else catalog connect default. */
export function projectDefaultPresetId(
  project: Project,
  catalog: PresetCatalog,
): string {
  const candidate = project.defaultPresetId;
  if (candidate && catalog.isValidPresetId(candidate)) return candidate;
  return catalog.defaultConnectPresetId;
}