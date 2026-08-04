import type { Finding, RequirementStatus } from "./types";

/**
 * Derives a requirement's status from the findings currently open against it.
 * Violations fail the requirement outright; warnings demand human review.
 */
export function deriveRequirementStatus(
  openFindings: ReadonlyArray<Pick<Finding, "kind">>,
): RequirementStatus {
  if (openFindings.some((finding) => finding.kind === "violation")) {
    return "failed";
  }
  if (openFindings.some((finding) => finding.kind === "warning")) {
    return "needs_review";
  }
  return "passed";
}
