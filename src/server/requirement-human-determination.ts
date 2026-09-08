import type {
  Requirement,
  RequirementException,
  RequirementHumanPass,
} from "@complyloop/analysis-core/contract/project-types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

/**
 * Apply a human determination override while enforcing mutual exclusion of
 * `humanPass` and `exception` (exactly one may be set).
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
