import { isOneOf } from "@complyloop/analysis-core/contract/literal-sets";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

import { type ProjectHref, projectPath } from "../routes";
import { href } from "./href";
import { firstParam, trimmedQuery } from "./params";

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = firstParam(raw);
  return isOneOf(REQUIREMENT_STATUSES, value) ? value : undefined;
}

/** Trimmed requirements search query (code or title), capped at 100 chars. */
export function parseRequirementsQueryParam(
  raw: string | string[] | undefined,
): string | undefined {
  return trimmedQuery(raw);
}

export function requirementsStatusHref(
  projectId: string,
  status?: RequirementStatus,
): ProjectHref {
  return href(projectPath(projectId, "requirements"), { status });
}

export function parsePresetIdParam(
  raw: string | string[] | undefined,
  isValidPresetId: (id: string) => boolean,
): string | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return isValidPresetId(value) ? value : undefined;
}

export function requirementsPageHref(options: {
  projectId: string;
  presetId?: string;
  status?: RequirementStatus;
  q?: string;
  page?: number;
  defaultPresetId: string;
}): ProjectHref {
  return href(projectPath(options.projectId, "requirements"), {
    presetId:
      options.presetId && options.presetId !== options.defaultPresetId
        ? options.presetId
        : undefined,
    status: options.status,
    q: options.q,
    page: options.page && options.page > 1 ? String(options.page) : undefined,
  });
}
