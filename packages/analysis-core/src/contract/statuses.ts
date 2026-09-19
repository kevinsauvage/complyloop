export type DeterminationMethod = "automated" | "human_review";

export const REQUIREMENT_STATUSES = [
  "passed",
  "failed",
  "needs_review",
  "not_applicable",
  "unable_to_verify",
] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** UI display order for requirement status counts and filters. */
export const REQUIREMENT_STATUS_DISPLAY_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "passed",
  "not_applicable",
  "unable_to_verify",
];

export const REMEDIATION_STATUSES = [
  "detected",
  "suggested",
  "approved",
  "implemented",
  "verified",
] as const;

export type RemediationStatus = (typeof REMEDIATION_STATUSES)[number];

export const FINDING_STATUSES = ["open", "resolved", "dismissed"] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** A violation fails the requirement; a warning needs human review. */
export type FindingKind = "violation" | "warning";

export type Severity = "critical" | "serious" | "moderate" | "minor";

/**
 * Canonical severity rank (lower sorts first). Single source for the findings
 * list order, the queue, and the `findings.severity_rank` denormalized column
 * (see `packages/db/src/schema.ts`): SQL `ORDER BY severity_rank, id` and the
 * JS fallback sort implement the same order, so paged and full loads agree.
 */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export type Confidence = "high" | "medium" | "low";

export type ExplanationProvenance = "deterministic" | "ai";
