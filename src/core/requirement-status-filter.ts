import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";
import { parseEnumParam } from "./query-param";

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = parseEnumParam(raw, REQUIREMENT_STATUSES);
  return value as RequirementStatus | undefined;
}

export function requirementsStatusHref(
  status?: RequirementStatus,
): string {
  if (!status) return "/requirements";
  return `/requirements?status=${status}`;
}
