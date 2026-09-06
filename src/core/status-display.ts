import type { EvidenceKind } from "@complyloop/db/types"
import type { AssessmentEngine } from "@complyloop/analysis-core/contract/finding-types";
import type { OrgRole } from "@complyloop/analysis-core/contract/project-types";
import type {
  Confidence,
  DeterminationMethod,
  ExplanationProvenance,
  FindingStatus,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";
import { lookupExhaustive } from "./assert-exhaustive";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function requirementStatusLabel(status: RequirementStatus): string {
  return lookupExhaustive(REQUIREMENT_STATUS_LABEL, status, "requirement status");
}

const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  needs_review: "Needs review",
  not_applicable: "Not applicable",
  unable_to_verify: "Unable to verify",
};

export function remediationStatusLabel(status: RemediationStatus): string {
  return lookupExhaustive(REMEDIATION_STATUS_LABEL, status, "remediation status");
}

const REMEDIATION_STATUS_LABEL: Record<RemediationStatus, string> = {
  detected: "Detected",
  suggested: "Suggested",
  approved: "Approved",
  implemented: "Implemented",
  verified: "Verified",
};

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  return lookupExhaustive(SEVERITY_RANK, severity, "severity");
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export function severityLabel(severity: Severity): string {
  return lookupExhaustive(SEVERITY_LABEL, severity, "severity");
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
};

export function findingStatusLabel(status: FindingStatus): string {
  return lookupExhaustive(FINDING_STATUS_LABEL, status, "finding status");
}

const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export function determinationLabel(method: DeterminationMethod): string {
  return lookupExhaustive(DETERMINATION_LABEL, method, "determination");
}

const DETERMINATION_LABEL: Record<DeterminationMethod, string> = {
  automated: "Automated",
  human_review: "Human review",
};

export function evidenceKindLabel(
  kind: EvidenceKind,
  detail?: Record<string, unknown>,
): string {
  if (kind === "finding") {
    switch (detail?.event) {
      case "detected":
        return "Finding detected";
      case "resolved":
        return "Finding resolved";
      case "dismissed":
        return "Finding dismissed";
      default:
        return "Finding";
    }
  }
  if (kind === "assessment_job") {
    switch (detail?.phase) {
      case "queued":
        return "Assessment queued";
      case "completed":
        return "Assessment job completed";
      case "failed":
        return "Assessment job failed";
      default:
        return "Assessment job";
    }
  }
  return lookupExhaustive(EVIDENCE_KIND_LABEL, kind, "evidence kind");
}

const EVIDENCE_KIND_LABEL: Record<
  Exclude<EvidenceKind, "finding" | "assessment_job">,
  string
> = {
  project_connected: "Project connected",
  project_disconnected: "Project disconnected",
  project_reset: "Project reset",
  assessment_completed: "Assessment completed",
  remediation_approved: "Remediation approved",
  remediation_implemented: "Remediation implemented",
  remediation_verified: "Remediation verified",
  remediation_manually_verified: "Manually verified",
  ai_remediation_suggested: "AI suggestion",
  ai_patch_ready: "Patch ready",
  requirement_status_changed: "Requirement status",
  requirement_exception_set: "Exception recorded",
  requirement_exception_cleared: "Exception cleared",
  requirement_human_passed: "Human pass",
  requirement_human_pass_cleared: "Human pass cleared",
  requirements_imported: "Scope updated",
  pull_request_prepared: "Pull request prepared",
  monitoring_changes_detected: "Repo changes detected",
  webhook_reassessment: "Webhook reassessment",
};

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

export function requirementStatusDescription(status: RequirementStatus): string {
  return lookupExhaustive(
    REQUIREMENT_STATUS_DESCRIPTION,
    status,
    "requirement status",
  );
}

const REQUIREMENT_STATUS_DESCRIPTION: Record<RequirementStatus, string> = {
  passed: "This requirement is satisfied — deterministic checks or a human reviewer confirmed compliance.",
  failed: "At least one finding failed this requirement — fix or dismiss findings before it can pass.",
  needs_review: "Automated checks flagged ambiguity — a human should confirm pass or fail.",
  not_applicable: "Marked out of scope for this project with a documented reason.",
  unable_to_verify: "The check could not run or conclude — see the recorded reason, not a pass or fail.",
};

export function remediationStatusDescription(status: RemediationStatus): string {
  return lookupExhaustive(
    REMEDIATION_STATUS_DESCRIPTION,
    status,
    "remediation status",
  );
}

const REMEDIATION_STATUS_DESCRIPTION: Record<RemediationStatus, string> = {
  detected: "Finding recorded — no fix workflow started yet.",
  suggested: "A fix is proposed (deterministic or AI) — review and approve before implementing.",
  approved: "Fix approved — implement in code, then mark implemented.",
  implemented: "Code change applied — re-assess or verify before closing the loop.",
  verified: "Fix confirmed by automated re-check or human verification — remediation complete.",
};

export function severityDescription(severity: Severity): string {
  return lookupExhaustive(SEVERITY_DESCRIPTION, severity, "severity");
}

const SEVERITY_DESCRIPTION: Record<Severity, string> = {
  critical: "Blocks core tasks for many users — prioritize immediately.",
  serious: "Major barrier for some users — fix in the current sprint if possible.",
  moderate: "Noticeable friction — schedule with other accessibility work.",
  minor: "Low impact — fix when touching nearby code.",
};

export function confidenceDescription(confidence: Confidence): string {
  return lookupExhaustive(CONFIDENCE_DESCRIPTION, confidence, "confidence");
}

const CONFIDENCE_DESCRIPTION: Record<Confidence, string> = {
  high: "Strong signal from the check — not a compliance status, but safe to act on.",
  medium: "Likely correct — skim the snippet before changing code.",
  low: "Weak or partial match — verify manually before treating as confirmed.",
};

export function determinationDescription(method: DeterminationMethod): string {
  return lookupExhaustive(
    DETERMINATION_DESCRIPTION,
    method,
    "determination",
  );
}

const DETERMINATION_DESCRIPTION: Record<DeterminationMethod, string> = {
  automated: "Status set by deterministic analysis — not an AI guess.",
  human_review: "A reviewer explicitly set this status — overrides automated results.",
};

export function provenanceDescription(provenance: ExplanationProvenance): string {
  return lookupExhaustive(PROVENANCE_DESCRIPTION, provenance, "provenance");
}

const PROVENANCE_DESCRIPTION: Record<ExplanationProvenance, string> = {
  deterministic: "Rule-based explanation from the check — baseline for compliance, not AI output.",
  ai: "Optional AI enrichment — never sets requirement status; review before trusting.",
};

export function engineDescription(engine: AssessmentEngine): string {
  return lookupExhaustive(ENGINE_DESCRIPTION, engine, "assessment engine");
}

const ENGINE_DESCRIPTION: Record<AssessmentEngine, string> = {
  ast: "Found in source code (AST) — fix the file and line shown.",
  runtime: "Found on the rendered page (DOM audit) — trace to the component that renders it.",
};

// ---------------------------------------------------------------------------
// Status tones
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Evidence tones
// ---------------------------------------------------------------------------

export type EvidenceTone = "default" | "pass" | "fail" | "review" | "signal";

const EVIDENCE_TONE: Record<EvidenceKind, EvidenceTone> = {
  project_connected: "default",
  project_disconnected: "default",
  project_reset: "default",
  assessment_completed: "pass",
  assessment_job: "signal",
  finding: "fail",
  remediation_approved: "signal",
  remediation_implemented: "signal",
  remediation_verified: "pass",
  remediation_manually_verified: "pass",
  ai_remediation_suggested: "signal",
  ai_patch_ready: "pass",
  requirement_status_changed: "review",
  requirement_exception_set: "review",
  requirement_exception_cleared: "default",
  requirement_human_passed: "pass",
  requirement_human_pass_cleared: "default",
  requirements_imported: "default",
  pull_request_prepared: "signal",
  monitoring_changes_detected: "fail",
  webhook_reassessment: "signal",
};

export function evidenceTone(
  kind: EvidenceKind,
  detail?: Record<string, unknown>,
): EvidenceTone {
  if (kind === "finding") {
    switch (detail?.event) {
      case "resolved":
        return "pass";
      case "dismissed":
        return "review";
      default:
        return "fail";
    }
  }
  if (kind === "assessment_job") {
    switch (detail?.phase) {
      case "completed":
        return "pass";
      case "failed":
        return "fail";
      default:
        return "signal";
    }
  }
  return lookupExhaustive(EVIDENCE_TONE, kind, "evidence kind");
}

export const EVIDENCE_TONE_DOT: Record<EvidenceTone, string> = {
  default: "bg-muted-foreground/40",
  pass: "bg-status-passed",
  fail: "bg-status-failed",
  review: "bg-status-review",
  signal: "bg-signal",
};

export const EVIDENCE_TONE_BADGE: Record<EvidenceTone, string> = {
  default: "",
  pass: STATUS_TONE_BADGE.passed,
  fail: STATUS_TONE_BADGE.failed,
  review: STATUS_TONE_BADGE.review,
  signal: STATUS_TONE_BADGE.signal,
};