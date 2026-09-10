import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { FindingLocation } from "@complyloop/analysis-core/contract/finding-types";

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
  const detail: Record<string, unknown> = {};
  if (options.bulk !== undefined) detail.bulk = options.bulk;
  if (options.manual !== undefined) detail.manual = options.manual;
  if (options.note !== undefined) detail.note = options.note;
  if (options.engine !== undefined) detail.engine = options.engine;
  if (options.approvalAction !== undefined) detail.approvalAction = options.approvalAction;
  if (options.fix !== undefined) detail.fix = options.fix;
  if (options.determination !== undefined) detail.determination = options.determination;
  if (options.method !== undefined) detail.method = options.method;
  return Object.keys(detail).length > 0 ? detail : undefined;
}
