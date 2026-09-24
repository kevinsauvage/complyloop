import type {
  Finding,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

/**
 * Timestamp of the human decision that makes a requirement sticky, or
 * `undefined` when the requirement is not sticky.
 */
export function stickyDecisionAt(requirement: Requirement): string | undefined {
  return requirement.exception?.at ?? requirement.humanPass?.at;
}

/**
 * The masked-residual detail: a sticky requirement whose status hides open
 * findings detected after the decision. Sticky decisions are never overwritten,
 * so without this the dashboard can read `passed` while regressions accumulate.
 * Returns `undefined` when nothing is masked.
 */
export function maskedFindingDetail(
  requirement: Requirement,
  recentOpenFindings: readonly Finding[],
): { count: number; since: string } | undefined {
  const since = stickyDecisionAt(requirement);
  if (!since || recentOpenFindings.length === 0) return undefined;
  return { count: recentOpenFindings.length, since };
}
