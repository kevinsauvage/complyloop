import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";
import { parseEnumParam, buildHref } from "./query-param";

export function parseRequirementStatusParam(
  raw: string | string[] | undefined,
): RequirementStatus | undefined {
  const value = parseEnumParam(raw, REQUIREMENT_STATUSES);
  return value as RequirementStatus | undefined;
}

export function requirementsStatusHref(
  status?: RequirementStatus,
): string {
  return buildHref("/requirements", status ? { status } : {});
}
