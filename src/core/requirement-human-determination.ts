import type {
  Requirement,
  RequirementException,
  RequirementHumanPass,
} from "@complyloop/analysis-core/contract/entities";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

/**
 * Apply a human determination override while enforcing mutual exclusion of
 * `humanPass` and `exception` (exactly one may be set).
 *
 * Write side of sticky human decisions — the read side (whether automation
 * may overwrite) is `isStickyHumanDecision` in
 * `@complyloop/analysis-core/contract/requirement-status.ts`. Keep the two
 * aligned: this module decides what gets stored, that one decides what sticks.
 */
export type HumanDeterminationOverride =
  | {
      kind: "exception";
      exception: RequirementException;
      /** When set (e.g. `not_applicable`), replaces `requirement.status`. */
      nextStatus?: RequirementStatus;
    }
  | {
      kind: "humanPass";
      humanPass: RequirementHumanPass;
    };

/**
 * Date-only input (`YYYY-MM-DD` from `<input type="date">`) means the whole
 * calendar day UTC — normalize to end of day so "expires today" stays valid
 * until the day is over instead of expiring at UTC midnight.
 */
export function normalizeExpiryInstant(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const instant = `${trimmed}T23:59:59.999Z`;
    return Number.isNaN(Date.parse(instant)) ? null : instant;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function setRequirementHumanDetermination(
  requirement: Requirement,
  override: HumanDeterminationOverride,
): { updated: Requirement; previous: RequirementStatus } {
  const previous = requirement.status;
  const updated: Requirement = {
    ...requirement,
    determination: "human_review",
    updatedAt: new Date().toISOString(),
  };

  switch (override.kind) {
    case "exception": {
      updated.exception = override.exception;
      delete updated.humanPass;
      if (override.nextStatus !== undefined) {
        updated.status = override.nextStatus;
      }
      break;
    }
    case "humanPass": {
      updated.humanPass = override.humanPass;
      updated.status = "passed";
      delete updated.exception;
      break;
    }
    default: {
      const _exhaustive: never = override;
      throw new Error(`Unhandled human determination: ${_exhaustive}`);
    }
  }

  return { updated, previous };
}

/** Clear one override field and reset determination to automated. */
export function clearRequirementHumanDetermination(
  requirement: Requirement,
  field: "humanPass" | "exception",
): Requirement {
  const updated: Requirement = {
    ...requirement,
    determination: "automated",
    updatedAt: new Date().toISOString(),
  };
  switch (field) {
    case "humanPass":
      delete updated.humanPass;
      break;
    case "exception":
      delete updated.exception;
      break;
    default: {
      const _exhaustive: never = field;
      throw new Error(`Unhandled clear field: ${_exhaustive}`);
    }
  }
  return updated;
}
