export type DeterminationMethod = "automated" | "human_review";

export const REQUIREMENT_STATUSES = [
  "passed",
  "failed",
  "needs_review",
  "not_applicable",
  "unable_to_verify",
] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

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

export type Confidence = "high" | "medium" | "low";

export type ExplanationProvenance = "deterministic" | "ai";
