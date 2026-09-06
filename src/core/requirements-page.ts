import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { firstParam, buildHref } from "./query-param";

export function parsePresetIdParam(
  raw: string | string[] | undefined,
  isValidPresetId: (id: string) => boolean,
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return isValidPresetId(value) ? value : undefined;
}

/** Preset shown on Requirements: URL override, else project default. */
export function effectiveRequirementsPresetId(
  urlPresetId: string | undefined,
  defaultPresetId: string,
): string {
  return urlPresetId ?? defaultPresetId;
}

export function requirementsPageHref(options: {
  presetId?: string;
  status?: RequirementStatus;
  defaultPresetId: string;
}): string {
  const params: Record<string, string> = {};
  if (options.presetId && options.presetId !== options.defaultPresetId) {
    params.presetId = options.presetId;
  }
  if (options.status) params.status = options.status;
  return buildHref("/requirements", params);
}
