import type {
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "./types";

export function requirementStatusLabel(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "needs_review":
      return "Needs review";
    case "not_applicable":
      return "Not applicable";
    case "unable_to_verify":
      return "Unable to verify";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function remediationStatusLabel(status: RemediationStatus): string {
  switch (status) {
    case "detected":
      return "Detected";
    case "investigating":
      return "Investigating";
    case "suggested":
      return "Suggested";
    case "approved":
      return "Approved";
    case "implemented":
      return "Implemented";
    case "verified":
      return "Verified";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "serious":
      return 1;
    case "moderate":
      return 2;
    case "minor":
      return 3;
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "serious":
      return "Serious";
    case "moderate":
      return "Moderate";
    case "minor":
      return "Minor";
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}
