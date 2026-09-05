import type { Project } from "@complyloop/domain/project-types";
import type { PresetCatalog } from "@complyloop/domain/preset";

export type { PresetCatalog } from "@complyloop/domain/preset";

/** Project default assessment preset, else catalog connect default. */
export function projectDefaultPresetId(
  project: Project,
  catalog: PresetCatalog,
): string {
  const candidate = project.defaultPresetId;
  if (candidate && catalog.isValidPresetId(candidate)) return candidate;
  return catalog.defaultConnectPresetId;
}