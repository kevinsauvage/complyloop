import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { FindingLocation } from "@complyloop/analysis-core/contract/finding-types";

/** Evidence summary for remediation lifecycle events (approved / implemented / verified). */
export function remediationEvidenceSummary(
  event: "approved" | "implemented" | "verified",
  finding: { checkId: string; location: FindingLocation },
): string {
  return `Remediation ${event} for ${finding.checkId} at ${formatLocationRef(finding.location)}`;
}
