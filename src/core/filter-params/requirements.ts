import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

import { href } from "./href";

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return (REQUIREMENT_STATUSES as readonly string[]).includes(value)
    ? (value as RequirementStatus)
    : undefined;
}

/** Trimmed requirements search query (code or title), capped at 100 chars. */
export function parseRequirementsQueryParam(
  raw: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 100).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requirementsStatusHref(status?: RequirementStatus): string {
  return href("/requirements", { status });
}

export function parsePresetIdParam(
  raw: string | string[] | undefined,
  isValidPresetId: (id: string) => boolean,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return isValidPresetId(value) ? value : undefined;
}

export function requirementsPageHref(options: {
  presetId?: string;
  status?: RequirementStatus;
  q?: string;
  page?: number;
  defaultPresetId: string;
}): string {
  return href("/requirements", {
    presetId:
      options.presetId && options.presetId !== options.defaultPresetId
        ? options.presetId
        : undefined,
    status: options.status,
    q: options.q,
    page: options.page && options.page > 1 ? String(options.page) : undefined,
  });
}
