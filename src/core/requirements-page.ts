import { projectDefaultPresetId } from "./project-preset";
import type { PresetCatalog } from "./project-preset";
import type { Project } from "./project-types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { firstParam } from "./query-param";

export function parsePresetIdParam(
  raw: string | string[] | undefined,
  catalog: PresetCatalog,
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return catalog.isValidPresetId(value) ? value : undefined;
}

/** Preset shown on Requirements: URL override, else project default. */
export function effectiveRequirementsPresetId(
  project: Project,
  urlPresetId: string | undefined,
  catalog: PresetCatalog,
): string {
  if (urlPresetId) return urlPresetId;
  return projectDefaultPresetId(project, catalog);
}

export function requirementsPageHref(options: {
  presetId?: string;
  status?: RequirementStatus;
  defaultPresetId: string;
}): string {
  const params = new URLSearchParams();
  if (
    options.presetId &&
    options.presetId !== options.defaultPresetId
  ) {
    params.set("presetId", options.presetId);
  }
  if (options.status) params.set("status", options.status);
  const query = params.toString();
  return query ? `/requirements?${query}` : "/requirements";
}
