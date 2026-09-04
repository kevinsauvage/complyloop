import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import type { OrgRole } from "./project-types";
import { lookupExhaustive } from "./assert-exhaustive";

export type StatusTone =
  | "passed"
  | "failed"
  | "review"
  | "na"
  | "unverifiable"
  | "signal";

export function statusTone(status: RequirementStatus): Exclude<StatusTone, "signal"> {
  return lookupExhaustive(
    STATUS_TONE,
    status,
    "requirement status",
  );
}

const STATUS_TONE: Record<RequirementStatus, Exclude<StatusTone, "signal">> = {
  passed: "passed",
  failed: "failed",
  needs_review: "review",
  not_applicable: "na",
  unable_to_verify: "unverifiable",
};

export function roleTone(role: OrgRole): StatusTone {
  return lookupExhaustive(ROLE_TONE, role, "org role");
}

const ROLE_TONE: Record<OrgRole, StatusTone> = {
  owner: "signal",
  admin: "review",
  member: "passed",
  viewer: "na",
};

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
