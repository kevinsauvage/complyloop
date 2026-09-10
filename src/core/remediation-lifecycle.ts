import { isDomLocation } from "@complyloop/analysis-core/contract/location";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import type { Finding, Remediation } from "@complyloop/analysis-core/contract/entities";
import type { RemediationStatus } from "@complyloop/analysis-core/contract/statuses";

/**
 * Remediation domain transitions. Framework-free: status legality lives here,
 * orchestration (locks, evidence, persistence) lives in `src/server`.
 */

function canTransition(
  from: RemediationStatus,
  to: RemediationStatus,
): boolean {
  switch (from) {
    case "detected":
      return to === "suggested";
    case "suggested":
      return to === "approved";
    case "approved":
      return to === "implemented";
    case "implemented":
      return to === "verified";
    case "verified":
      return false;
    default: {
      const _exhaustive: never = from;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export function advanceRemediation(
  remediation: Remediation,
  to: RemediationStatus,
  note?: string,
): Remediation {
  if (!canTransition(remediation.status, to)) {
    throw new Error(
      `Invalid remediation transition: ${remediation.status} → ${to}`,
    );
  }
  return appendRemediationHistory(remediation, to, note);
}

/** Append a history entry without changing status (e.g. failed verification). */
export function appendRemediationHistory(
  remediation: Remediation,
  status: RemediationStatus,
  note?: string,
): Remediation {
  return {
    ...remediation,
    status,
    history: [
      ...remediation.history,
      { status, at: new Date().toISOString(), note },
    ],
  };
}

/**
 * Sets or replaces a remediation suggestion before approval.
 * `detected` → `suggested` via the normal transition; `suggested` stays
 * `suggested` with a history note (refresh, not a status change).
 */
export function refreshSuggestion(
  remediation: Remediation,
  suggestion: RemediationSuggestion,
  note: string,
): Remediation {
  switch (remediation.status) {
    case "detected":
      return advanceRemediation(
        { ...remediation, suggestion },
        "suggested",
        note,
      );
    case "suggested":
      return appendRemediationHistory(
        { ...remediation, suggestion },
        "suggested",
        note,
      );
    case "approved":
    case "implemented":
    case "verified":
      throw new Error(
        "Suggestions can only be set or refreshed before approval.",
      );
    default: {
      const _exhaustive: never = remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export function hasSafeDeterministicFix(finding: Finding): boolean {
  return Boolean(
    finding.fix &&
      !(finding.fix.kind === "insert_attribute" && finding.fix.editable),
  );
}

/** Single copy for the verified-finding description. */
export function verifiedDescription(finding: Finding): string {
  return finding.resolvedNote ?? "Fix confirmed by automated re-check.";
}

/** Bulk approve is for runtime guidance only — source findings use patch → PR. */
export function canBulkApproveRemediation(
  finding: Finding,
  remediationStatus: RemediationStatus,
): boolean {
  return (
    finding.status === "open" &&
    remediationStatus === "suggested" &&
    isDomLocation(finding.location)
  );
}
