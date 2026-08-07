export type DeterminationMethod = "automated" | "human_review";

export type RequirementStatus =
  | "passed"
  | "failed"
  | "needs_review"
  | "not_applicable"
  | "unable_to_verify";

export type RemediationStatus =
  | "detected"
  | "investigating"
  | "suggested"
  | "approved"
  | "implemented"
  | "verified";

export type FindingStatus = "open" | "resolved" | "dismissed";

/** A violation fails the requirement; a warning needs human review. */
export type FindingKind = "violation" | "warning";

export type Severity = "critical" | "serious" | "moderate" | "minor";

export type Confidence = "high" | "medium" | "low";

export type ExplanationProvenance = "deterministic" | "ai";
