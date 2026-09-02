import { presetById } from "@/adapters/registry";
import { projectDefaultPresetId } from "@/core/project-preset";
import type { Project } from "@/core/project-types";
import type { RequirementStatus } from "./statuses";

function firstParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function parsePresetIdParam(
  raw: string | string[] | undefined,
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return presetById(value) ? value : undefined;
}

/** Preset shown on Requirements: URL override, else project default. */
export function effectiveRequirementsPresetId(
  project: Project,
  urlPresetId: string | undefined,
): string {
  if (urlPresetId) return urlPresetId;
  return projectDefaultPresetId(project);
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
