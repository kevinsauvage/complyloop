import type { RemediationStatus } from "./statuses";
import type { Remediation } from "./finding-types";

export function canTransition(
  from: RemediationStatus,
  to: RemediationStatus,
): boolean {
  switch (from) {
    case "detected":
      return to === "investigating" || to === "suggested";
    case "investigating":
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
  return {
    ...remediation,
    status: to,
    history: [
      ...remediation.history,
      { status: to, at: new Date().toISOString(), note },
    ],
  };
}
