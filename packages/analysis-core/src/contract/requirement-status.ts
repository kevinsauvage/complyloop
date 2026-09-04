import type { FindingKind, RequirementStatus } from "./statuses.js";

/** html-validate-owned runtime checks (see check-authority.ts). */
function requiresHtmlValidatePass(checkId: string): boolean {
  return checkId === "markup-nesting" || checkId === "css-for-presentation";
}

/**
 * Which engine "owns" status for this requirement's check. Mirrors the four
 * authority classes in `packages/analysis-core/src/check-authority.ts` (manual = no check).
 * Core stays framework-agnostic: the adapters map check ids to a class.
 */
export type CheckAuthority =
  | "manual"
  | "standard"
  | "composition_sensitive"
  | "runtime_only"
  | "heuristic"
  | "site_level";

/** Minimal finding view needed to derive status. */
export interface DerivationFinding {
  kind: FindingKind;
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
  /** Did the rendered-page (runtime) audit run for the latest assessment? */
  runtimeRan?: boolean;
  /** Did site-level checks run (requires ≥2 audited routes)? */
  siteLevelChecksRan?: boolean;
  /** Catalog check id being derived (needed for html-validate-owned gates). */
  checkId?: string | null;
  /** Did html-validate succeed on at least one preview page? */
  htmlValidateRan?: boolean;
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

  switch (input.authority) {
    case "manual":
    case "heuristic":
      return "unable_to_verify";
    case "runtime_only":
      if (
        input.checkId &&
        requiresHtmlValidatePass(input.checkId) &&
        input.htmlValidateRan !== true
      ) {
        return "unable_to_verify";
      }
      return input.runtimeRan === true ? "passed" : "unable_to_verify";
    case "site_level":
      return input.runtimeRan === true && input.siteLevelChecksRan === true
        ? "passed"
        : "unable_to_verify";
    case "standard":
    case "composition_sensitive":
      return "passed";
    default: {
      const _exhaustive: never = input.authority;
      throw new Error(`Unhandled check authority: ${String(_exhaustive)}`);
    }
  }
}
