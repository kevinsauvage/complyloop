import "server-only";

import type { FindingLocation } from "@complyloop/analysis-core/contract/finding-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";

/** Evidence summary for remediation lifecycle events (approved / implemented / verified). */
export function remediationEvidenceSummary(
  event: "approved" | "implemented" | "verified",
  finding: { checkId: string; location: FindingLocation },
): string {
  return `Remediation ${event} for ${finding.checkId} at ${formatLocationRef(finding.location)}`;
}

/**
 * Single constructor for remediation evidence `detail` so new keys
 * (bulk, manual, engine, approvalAction, determination…) are added once.
 * Drops undefined values; returns undefined when empty.
 */
export function remediationEvidenceDetail(options: {
  bulk?: boolean;
  manual?: boolean;
  note?: string;
  engine?: string;
  approvalAction?: string;
  fix?: unknown;
  determination?: string;
  method?: string;
}): Record<string, unknown> | undefined {
  const detail = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );
  return Object.keys(detail).length > 0 ? detail : undefined;
}
