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

/**
 * Display data lives as one record per enum value: `{ label, description,
 * tone? }`. Adding a status edits a single table, and `lookupExhaustive`
 * still fails loud on unhandled values. Thin getters select one field for
 * call sites that only need a label or tone.
 */

// ---------------------------------------------------------------------------
// Requirement status
// ---------------------------------------------------------------------------

export type StatusTone =
  | "passed"
  | "failed"
  | "review"
  | "na"
  | "unverifiable"
  | "signal";

export interface RequirementStatusDisplay {
  label: string;
  description: string;
  tone: Exclude<StatusTone, "signal">;
}

export function requirementStatusDisplay(
  status: RequirementStatus,
): RequirementStatusDisplay {
  return lookupExhaustive(
    REQUIREMENT_STATUS_DISPLAY,
    status,
    "requirement status",
  );
}

const REQUIREMENT_STATUS_DISPLAY: Record<
  RequirementStatus,
  RequirementStatusDisplay
> = {
  passed: {
    label: "Passed",
    description:
      "This requirement is satisfied — deterministic checks or a human reviewer confirmed compliance.",
    tone: "passed",
  },
  failed: {
    label: "Failed",
    description:
      "At least one finding failed this requirement — fix or dismiss findings before it can pass.",
    tone: "failed",
  },
  needs_review: {
    label: "Needs review",
    description:
      "Automated checks flagged ambiguity — a human should confirm pass or fail.",
    tone: "review",
  },
  not_applicable: {
    label: "Not applicable",
    description:
      "Marked out of scope for this project with a documented reason.",
    tone: "na",
  },
  unable_to_verify: {
    label: "Unable to verify",
    description:
      "The check could not run or conclude — see the recorded reason, not a pass or fail.",
    tone: "unverifiable",
  },
};

export function requirementStatusLabel(status: RequirementStatus): string {
  return requirementStatusDisplay(status).label;
}

export function requirementStatusTone(
  status: RequirementStatus,
): RequirementStatusDisplay["tone"] {
  return requirementStatusDisplay(status).tone;
}

// ---------------------------------------------------------------------------
// Remediation status
// ---------------------------------------------------------------------------

export interface RemediationStatusDisplay {
  label: string;
  description: string;
}

export function remediationStatusDisplay(
  status: RemediationStatus,
): RemediationStatusDisplay {
  return lookupExhaustive(
    REMEDIATION_STATUS_DISPLAY,
    status,
    "remediation status",
  );
}

const REMEDIATION_STATUS_DISPLAY: Record<
  RemediationStatus,
  RemediationStatusDisplay
> = {
  detected: {
    label: "Detected",
    description: "Finding recorded — no fix workflow started yet.",
  },
  suggested: {
    label: "Suggested",
    description:
      "A fix is proposed (deterministic or AI) — review and approve before implementing.",
  },
  approved: {
    label: "Approved",
    description: "Fix approved — implement in code, then mark implemented.",
  },
  implemented: {
    label: "Implemented",
    description:
      "Code change applied — re-assess or verify before closing the loop.",
  },
  verified: {
    label: "Verified",
    description:
      "Fix confirmed by automated re-check or human verification — remediation complete.",
  },
};

export function remediationStatusLabel(status: RemediationStatus): string {
  return remediationStatusDisplay(status).label;
}

// ---------------------------------------------------------------------------
// Finding status
// ---------------------------------------------------------------------------

export function findingStatusLabel(status: FindingStatus): string {
  return lookupExhaustive(FINDING_STATUS_LABEL, status, "finding status");
}

const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

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
  return severityDisplay(severity).label;
}

export function severityDescription(severity: Severity): string {
  return severityDisplay(severity).description;
}

const SEVERITY_DISPLAY: Record<Severity, { label: string; description: string }> =
  {
    critical: {
      label: "Critical",
      description: "Blocks core tasks for many users — prioritize immediately.",
    },
    serious: {
      label: "Serious",
      description:
        "Major barrier for some users — fix in the current sprint if possible.",
    },
    moderate: {
      label: "Moderate",
      description: "Noticeable friction — schedule with other accessibility work.",
    },
    minor: {
      label: "Minor",
      description: "Low impact — fix when touching nearby code.",
    },
  };

function severityDisplay(severity: Severity): {
  label: string;
  description: string;
} {
  return lookupExhaustive(SEVERITY_DISPLAY, severity, "severity");
}

// ---------------------------------------------------------------------------
// Determination
// ---------------------------------------------------------------------------

export function determinationLabel(method: DeterminationMethod): string {
  return determinationDisplay(method).label;
}

export function determinationDescription(method: DeterminationMethod): string {
  return determinationDisplay(method).description;
}

const DETERMINATION_DISPLAY: Record<
  DeterminationMethod,
  { label: string; description: string }
> = {
  automated: {
    label: "Automated",
    description: "Status set by deterministic analysis — not an AI guess.",
  },
  human_review: {
    label: "Human review",
    description:
      "A reviewer explicitly set this status — overrides automated results.",
  },
};

function determinationDisplay(method: DeterminationMethod): {
  label: string;
  description: string;
} {
  return lookupExhaustive(DETERMINATION_DISPLAY, method, "determination");
}

// ---------------------------------------------------------------------------
// Confidence / provenance / engine
// ---------------------------------------------------------------------------

export function confidenceDescription(confidence: Confidence): string {
  return lookupExhaustive(CONFIDENCE_DESCRIPTION, confidence, "confidence");
}

const CONFIDENCE_DESCRIPTION: Record<Confidence, string> = {
  high: "Strong signal from the check — not a compliance status, but safe to act on.",
  medium: "Likely correct — skim the snippet before changing code.",
  low: "Weak or partial match — verify manually before treating as confirmed.",
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
// Org role tone
// ---------------------------------------------------------------------------

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

export const STATUS_TONE_ACCENT: Record<
  Exclude<StatusTone, "signal">,
  string
> = {
  passed: "bg-status-passed",
  failed: "bg-status-failed",
  review: "bg-status-review",
  na: "bg-status-na",
  unverifiable: "bg-status-unverifiable",
};

// ---------------------------------------------------------------------------
// Evidence — one record per kind; `finding` and `assessment_job` refine
// label + tone together from `detail`, so the two stay in sync.
// ---------------------------------------------------------------------------

export type EvidenceTone = "default" | "pass" | "fail" | "review" | "signal";

interface EvidenceDisplay {
  label: string;
  tone: EvidenceTone;
}

const EVIDENCE_DISPLAY: Record<EvidenceKind, EvidenceDisplay> = {
  project_connected: { label: "Project connected", tone: "default" },
  project_disconnected: { label: "Project disconnected", tone: "default" },
  project_reset: { label: "Project reset", tone: "default" },
  assessment_completed: { label: "Assessment completed", tone: "pass" },
  assessment_job: { label: "Assessment job", tone: "signal" },
  finding: { label: "Finding", tone: "fail" },
  remediation_approved: { label: "Remediation approved", tone: "signal" },
  remediation_implemented: { label: "Remediation implemented", tone: "signal" },
  remediation_verified: { label: "Remediation verified", tone: "pass" },
  remediation_manually_verified: { label: "Manually verified", tone: "pass" },
  ai_remediation_suggested: { label: "AI suggestion", tone: "signal" },
  ai_patch_ready: { label: "Patch ready", tone: "pass" },
  requirement_status_changed: { label: "Requirement status", tone: "review" },
  requirement_exception_set: { label: "Exception recorded", tone: "review" },
  requirement_exception_cleared: { label: "Exception cleared", tone: "default" },
  requirement_human_passed: { label: "Human pass", tone: "pass" },
  requirement_human_pass_cleared: { label: "Human pass cleared", tone: "default" },
  requirements_imported: { label: "Scope updated", tone: "default" },
  pull_request_prepared: { label: "Pull request prepared", tone: "signal" },
  monitoring_changes_detected: { label: "Repo changes detected", tone: "fail" },
  webhook_reassessment: { label: "Webhook reassessment", tone: "signal" },
};

/** `finding` evidence refines label + tone together from `detail.event`. */
const FINDING_EVENT_DISPLAY: Record<string, EvidenceDisplay> = {
  detected: { label: "Finding detected", tone: "fail" },
  resolved: { label: "Finding resolved", tone: "pass" },
  dismissed: { label: "Finding dismissed", tone: "review" },
};

/** `assessment_job` evidence refines label + tone together from `detail.phase`. */
const ASSESSMENT_JOB_PHASE_DISPLAY: Record<string, EvidenceDisplay> = {
  queued: { label: "Assessment queued", tone: "signal" },
  completed: { label: "Assessment job completed", tone: "pass" },
  failed: { label: "Assessment job failed", tone: "fail" },
};

/** Label + tone for an evidence record — one lookup, no parallel branches. */
export function evidenceDisplay(
  kind: EvidenceKind,
  detail?: Record<string, unknown>,
): EvidenceDisplay {
  if (kind === "finding") {
    const event = detail?.event;
    return (
      (typeof event === "string" ? FINDING_EVENT_DISPLAY[event] : undefined) ??
      EVIDENCE_DISPLAY.finding
    );
  }
  if (kind === "assessment_job") {
    const phase = detail?.phase;
    return (
      (typeof phase === "string"
        ? ASSESSMENT_JOB_PHASE_DISPLAY[phase]
        : undefined) ?? EVIDENCE_DISPLAY.assessment_job
    );
  }
  return lookupExhaustive(EVIDENCE_DISPLAY, kind, "evidence kind");
}

export function evidenceKindLabel(
  kind: EvidenceKind,
  detail?: Record<string, unknown>,
): string {
  return evidenceDisplay(kind, detail).label;
}

export function evidenceTone(
  kind: EvidenceKind,
  detail?: Record<string, unknown>,
): EvidenceTone {
  return evidenceDisplay(kind, detail).tone;
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
