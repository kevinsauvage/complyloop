import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";
import { firstParam } from "./query-param";

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = firstParam(raw);
  if (!value) return undefined;
  return (REQUIREMENT_STATUSES as readonly string[]).includes(value)
    ? (value as RequirementStatus)
    : undefined;
}

export function requirementsStatusHref(
  status?: RequirementStatus,
): string {
  if (!status) return "/requirements";
  return `/requirements?status=${status}`;
}
