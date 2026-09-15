import type { FindingKind, RequirementStatus } from "./statuses.ts";

/**
 * Which engine "owns" status for this requirement's check. Mirrors the four
 * authority classes in `packages/analysis-core/src/check-authority.ts` (manual = no check).
 * Core stays framework-agnostic: the catalog maps check ids to a class.
 */
export type CheckAuthority =
  "manual" | "standard" | "runtime_only" | "heuristic" | "site_level";

/** Minimal finding view needed to derive status. */
export interface DerivationFinding {
  kind: FindingKind;
}

/** Which engines ran during the latest assessment — gates status derivation. */
export interface AuditEnginesRan {
  runtimeRan?: boolean;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
  htmlValidateRequired?: boolean;
  applicabilityConfirmed?: boolean;
  filesScanned?: number;
}

/** Everything that can influence a requirement's status, in precedence order. */
export interface DeriveRequirementStatusInput {
  authority: CheckAuthority;
  /** Currently open findings against the requirement. */
  openFindings?: ReadonlyArray<DerivationFinding>;
  /** Status recorded before this derivation (sticky when human-decided). */
  currentStatus?: RequirementStatus;
  /** How the current status was determined. */
  determination?: "automated" | "human_review";
  hasException?: boolean;
  hasHumanPass?: boolean;
  audit?: AuditEnginesRan;
}

/**
 * Human exceptions and human passes stick until explicitly cleared: a new
 * assessment must not overwrite a human's compliance decision.
 */
export function isStickyHumanDecision(
  input: Pick<
    DeriveRequirementStatusInput,
    "determination" | "hasException" | "hasHumanPass"
  >,
): boolean {
  return (
    input.determination === "human_review" &&
    Boolean(input.hasException || input.hasHumanPass)
  );
}

/**
 * Single source of truth for requirement status. Precedence:
 * 1. Sticky human decisions (exception / human pass) — never overwritten.
 * 2. Open violations → failed; warnings → needs_review.
 * 3. Authority gates — runtime-only / site-level / heuristic checks stay
 *    `unable_to_verify` until their engine actually ran.
 */
export function deriveRequirementStatus(
  input: DeriveRequirementStatusInput,
): RequirementStatus {
  if (isStickyHumanDecision(input)) {
    return input.currentStatus ?? "unable_to_verify";
  }

  const { openFindings } = input;
  if (openFindings && openFindings.length > 0) {
    if (openFindings.some((finding) => finding.kind === "violation")) {
      return "failed";
    }
    return "needs_review";
  }

  if (
    input.audit?.applicabilityConfirmed === true &&
    input.audit?.runtimeRan === true
  ) {
    return "not_applicable";
  }

  const audit = input.audit;
  switch (input.authority) {
    case "manual":
    case "heuristic":
      return "unable_to_verify";
    case "runtime_only":
      if (
        audit?.htmlValidateRequired === true &&
        audit.htmlValidateRan !== true
      ) {
        return "unable_to_verify";
      }
      return audit?.runtimeRan === true ? "passed" : "unable_to_verify";
    case "site_level":
      return audit?.runtimeRan === true && audit.siteLevelChecksRan === true
        ? "passed"
        : "unable_to_verify";
    case "standard":
      // Undefined means "no AST scan context" (e.g. dismiss/refresh without a
      // scan) — must not default to passed. Only a real scan (>0 files)
      // can pass a standard control.
      return typeof audit?.filesScanned === "number" && audit.filesScanned > 0
        ? "passed"
        : "unable_to_verify";
    default: {
      const _exhaustive: never = input.authority;
      throw new Error(`Unhandled check authority: ${String(_exhaustive)}`);
    }
  }
}
