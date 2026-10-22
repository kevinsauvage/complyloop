import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import { isDomLocation } from "@complyloop/analysis-core/contract/location";
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

/**
 * Advance a remediation's status. Writes no `history[]`: every transition
 * site records the event once, as evidence (a `remediation_*` row carrying
 * the note), and the timeline UI reads evidence. `history` stays on the type
 * for old rows only.
 */
export function advanceRemediation(
  remediation: Remediation,
  to: RemediationStatus,
): Remediation {
  if (!canTransition(remediation.status, to)) {
    throw new Error(
      `Invalid remediation transition: ${remediation.status} → ${to}`,
    );
  }
  return { ...remediation, status: to };
}

/**
 * Sets or replaces a remediation suggestion before approval.
 * `detected` → `suggested` via the normal transition; `suggested` stays
 * `suggested` with the suggestion replaced (refresh, not a status change).
 * Writes no `history[]` — the suggestion event is recorded as evidence
 * (`ai_remediation_suggested` / `ai_patch_ready` / `remediation_suggested`)
 * by the caller.
 */
export function refreshSuggestion(
  remediation: Remediation,
  suggestion: RemediationSuggestion,
): Remediation {
  switch (remediation.status) {
    case "detected":
      return advanceRemediation({ ...remediation, suggestion }, "suggested");
    case "suggested":
      return { ...remediation, suggestion };
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

/**
 * Bulk approve covers runtime guidance plus source findings with a
 * deterministic high-confidence fix — those need no human-authored
 * value, so one-by-one triage adds nothing. All other source findings still
 * use patch → PR.
 */
export function canBulkApproveRemediation(
  finding: Finding,
  remediationStatus: RemediationStatus,
  suggestion?: RemediationSuggestion | null,
): boolean {
  if (finding.status !== "open" || remediationStatus !== "suggested") {
    return false;
  }
  if (isDomLocation(finding.location)) return true;
  return (
    suggestion?.provenance === "deterministic" &&
    suggestion.confidence === "high"
  );
}
