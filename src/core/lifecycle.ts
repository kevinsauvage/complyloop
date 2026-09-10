/**
 * Compat shim for the pre-split god module. Prefer importing from the
 * focused modules directly:
 *
 * - `src/core/remediation-lifecycle.ts` — transitions / history / suggestion
 *   refresh, fix-safety helpers (domain; safe for worker/batch paths)
 * - `src/core/assessment-helpers.ts` — latest assessment, preview coverage,
 *   status counting (safe for worker/batch paths)
 * - `src/core/finding-priority.ts` — severity order, clustering,
 *   prioritization, unable-to-verify reasons (application policy)
 * - `src/core/finding-act.ts` — finding-page UX beat model (never import
 *   from `src/server/assessment*` — enforced by ESLint)
 * - `src/core/datetime.ts` — date/time formatters
 * - `src/core/finding-cluster.ts` — `FindingCluster` presentation type
 *
 * Delete this file once callers migrate (one-release shim).
 */

export type { FindingCluster } from "./finding-cluster";
export {
  countByStatus,
  hasPreviewUrl,
  latestAssessmentFor,
  runtimeCoverageSummary,
  toCountMap,
} from "./assessment-helpers";
export type {
  RuntimeCoverageMode,
  RuntimeCoverageSummary,
} from "./assessment-helpers";
export { formatDateTime, formatDateTimeWithZone } from "./datetime";
export {
  clusterFindings,
  prioritizeClusters,
  prioritizeFindings,
  SEVERITY_ORDER,
  severityRank,
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "./finding-priority";
export type { UnableToVerifyReason } from "./finding-priority";
export {
  advanceRemediation,
  appendRemediationHistory,
  canBulkApproveRemediation,
  hasSafeDeterministicFix,
  refreshSuggestion,
  verifiedDescription,
} from "./remediation-lifecycle";
export { findingAct } from "./finding-act";
export type { FindingActInput, FindingActView } from "./finding-act";
