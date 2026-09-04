import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import type { OrgRole } from "@/core/project-types";

export type StatusTone =
  | "passed"
  | "failed"
  | "review"
  | "na"
  | "unverifiable"
  | "signal";

export function statusTone(status: RequirementStatus): Exclude<StatusTone, "signal"> {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "needs_review":
      return "review";
    case "not_applicable":
      return "na";
    case "unable_to_verify":
      return "unverifiable";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function roleTone(role: OrgRole): StatusTone {
  switch (role) {
    case "owner":
      return "signal";
    case "admin":
      return "review";
    case "member":
      return "passed";
    case "viewer":
      return "na";
    default: {
      const _exhaustive: never = role;
      throw new Error(`Unhandled org role: ${_exhaustive}`);
    }
  }
}

/** Soft tint + readable text; stronger fill in dark mode for contrast. */
export const STATUS_TONE_BADGE: Record<StatusTone, string> = {
  passed:
    "border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25",
  failed:
    "border-transparent bg-status-failed/15 text-status-failed dark:bg-status-failed/25",
  review:
    "border-transparent bg-status-review/15 text-status-review dark:bg-status-review/25",
  na: "border-transparent bg-status-na/15 text-status-na dark:bg-status-na/25",
  unverifiable:
    "border-transparent bg-status-unverifiable/15 text-status-unverifiable dark:bg-status-unverifiable/25",
  signal: "border-transparent bg-signal/15 text-signal dark:bg-signal/25",
};

export const STATUS_TONE_ACCENT: Record<Exclude<StatusTone, "signal">, string> = {
  passed: "bg-status-passed",
  failed: "bg-status-failed",
  review: "bg-status-review",
  na: "bg-status-na",
  unverifiable: "bg-status-unverifiable",
};
