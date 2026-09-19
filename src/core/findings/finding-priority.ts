import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  type Severity,
  SEVERITY_RANK,
} from "@complyloop/analysis-core/contract/statuses";

import { hasPreviewUrl } from "../assessment/assessment-helpers";
import { mustGet } from "../display/must-get";

/**
 * Finding ordering policy: severity order and unable-to-verify reasons.
 * Application policy over domain data — the assessment worker depends on the
 * remediation module, never on this file or the finding-act UX model.
 */

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  return mustGet(SEVERITY_RANK, severity, "severity");
}

/**
 * Severity-first list order (lower severity rank first, stable id tiebreak).
 * Single JS implementation of the list order — SQL `ORDER BY severity_rank,
 * id` (see `packages/db/src/repo/findings.ts`) implements the same order, so
 * paged and full loads agree.
 */
export function compareFindingsBySeverity(a: Finding, b: Finding): number {
  return (
    severityRank(a.severity) - severityRank(b.severity) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Canonical severity order (single source; list filter re-exports it). */
export const SEVERITY_ORDER = [
  "critical",
  "serious",
  "moderate",
  "minor",
] as const satisfies readonly Severity[];

export type UnableToVerifyReason =
  | "needs_preview_url"
  | "needs_human_review"
  | "needs_pertinence_review"
  | "needs_heuristic_review"
  | "runtime_only_pending"
  | "non_scorable";

export function unableToVerifyReason(
  control: Pick<Control, "checkId">,
  project: Pick<Project, "runtimeBaseUrl">,
  options: {
    isRuntimeOnlyCheck: boolean;
    isHeuristicCheck?: boolean;
    isPertinenceTwin?: boolean;
  },
): UnableToVerifyReason {
  if (options.isPertinenceTwin) {
    return "needs_pertinence_review";
  }

  if (options.isHeuristicCheck) {
    return "needs_heuristic_review";
  }

  if (control.checkId === null) {
    return "needs_human_review";
  }

  const hasPreview = hasPreviewUrl(project);

  if (options.isRuntimeOnlyCheck && !hasPreview) {
    return "needs_preview_url";
  }

  if (options.isRuntimeOnlyCheck && hasPreview) {
    return "runtime_only_pending";
  }

  return "non_scorable";
}

const UNABLE_TO_VERIFY_REASON_LABEL: Record<UnableToVerifyReason, string> = {
  needs_preview_url:
    "Needs a preview URL — runtime-only checks cannot run on source alone.",
  needs_human_review:
    "Needs human review — this control is not machine-scored.",
  needs_pertinence_review: "Presence checked; pertinence needs a human.",
  needs_heuristic_review:
    "No suspicious pattern was found; that is not a pass of the criterion — a human still needs to review.",
  runtime_only_pending:
    "Preview URL is set — re-run assessment after the preview is reachable.",
  non_scorable:
    "Could not verify automatically — review manually or record an exception.",
};

export function unableToVerifyReasonLabel(
  reason: UnableToVerifyReason,
): string {
  return mustGet(
    UNABLE_TO_VERIFY_REASON_LABEL,
    reason,
    "unable-to-verify reason",
  );
}
