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

import { mustGet } from "./must-get";
import {
  type BadgeVariant,
  type ReportColorPair,
  type StatusTone,
  STATUS_TONE_REPORT_CLASS,
} from "./report-tones";

// ---------------------------------------------------------------------------
// Requirement status
// ---------------------------------------------------------------------------

export interface RequirementStatusDisplay {
  label: string;
  description: string;
  tone: Exclude<StatusTone, "signal">;
}

export function requirementStatusDisplay(
  status: RequirementStatus,
): RequirementStatusDisplay {
  return mustGet(REQUIREMENT_STATUS_DISPLAY, status, "requirement status");
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

// ---------------------------------------------------------------------------
// Remediation status
// ---------------------------------------------------------------------------

export interface RemediationStatusDisplay {
  label: string;
  description: string;
  tone: StatusTone | null;
  badgeVariant: BadgeVariant;
}

export function remediationStatusDisplay(
  status: RemediationStatus,
): RemediationStatusDisplay {
  return mustGet(REMEDIATION_STATUS_DISPLAY, status, "remediation status");
}

const REMEDIATION_STATUS_DISPLAY: Record<
  RemediationStatus,
  RemediationStatusDisplay
> = {
  detected: {
    label: "Detected",
    description:
      "Finding recorded — triage needed, no fix workflow started yet.",
    tone: "signal",
    badgeVariant: "outline",
  },
  suggested: {
    label: "Suggested",
    description:
      "A fix is proposed (deterministic or AI) — review and approve before implementing.",
    tone: "signal",
    badgeVariant: undefined,
  },
  approved: {
    label: "Approved",
    description: "Fix approved — implement in code, then mark implemented.",
    tone: "signal",
    badgeVariant: undefined,
  },
  implemented: {
    label: "Implemented",
    description:
      "Code change applied — re-assess or verify before closing the loop.",
    tone: "unverifiable",
    badgeVariant: undefined,
  },
  verified: {
    label: "Verified",
    description:
      "Fix confirmed by automated re-check or human verification — remediation complete.",
    tone: "passed",
    badgeVariant: undefined,
  },
};

// ---------------------------------------------------------------------------
// Finding status
// ---------------------------------------------------------------------------

export interface FindingStatusDisplay {
  label: string;
  description: string;
  tone: StatusTone;
}

export function findingStatusDisplay(
  status: FindingStatus,
): FindingStatusDisplay {
  return mustGet(FINDING_STATUS_DISPLAY, status, "finding status");
}

const FINDING_STATUS_DISPLAY: Record<FindingStatus, FindingStatusDisplay> = {
  open: {
    label: "Open",
    description:
      "Still needs a fix — the finding counts until it is resolved or recorded as an exception.",
    tone: "signal",
  },
  resolved: {
    label: "Resolved",
    description: "Fixed and confirmed — closed by verification.",
    tone: "passed",
  },
  dismissed: {
    label: "Dismissed",
    description:
      "Closed as a documented exception — an explicit decision, not a fix.",
    tone: "review",
  },
};

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export interface SeverityDisplay {
  label: string;
  description: string;
  tone: StatusTone | null;
  badgeVariant: BadgeVariant;
  /** Print/email hex pair for the standalone report (Tailwind unavailable). */
  report: ReportColorPair;
}

export function severityDisplay(severity: Severity): SeverityDisplay {
  return mustGet(SEVERITY_DISPLAY, severity, "severity");
}

const SEVERITY_DISPLAY: Record<Severity, SeverityDisplay> = {
  critical: {
    label: "Critical",
    description: "Blocks core tasks for many users — prioritize immediately.",
    tone: "failed",
    badgeVariant: undefined,
    report: { fg: "#991b1b", bg: "#fecaca" },
  },
  serious: {
    label: "Serious",
    description:
      "Major barrier for some users — fix in the current sprint if possible.",
    tone: "failed",
    badgeVariant: "outline",
    report: { fg: "#c2410c", bg: "#ffedd5" },
  },
  moderate: {
    label: "Moderate",
    description:
      "Noticeable friction — schedule with other accessibility work.",
    tone: "review",
    badgeVariant: undefined,
    report: { fg: "#a16207", bg: "#fef9c3" },
  },
  minor: {
    label: "Minor",
    description: "Low impact — fix when touching nearby code.",
    tone: null,
    badgeVariant: "secondary",
    report: { fg: "#0369a1", bg: "#e0f2fe" },
  },
};

// ---------------------------------------------------------------------------
// Determination
// ---------------------------------------------------------------------------

export interface DeterminationDisplay {
  label: string;
  description: string;
  tone: StatusTone;
}

export function determinationDisplay(
  method: DeterminationMethod,
): DeterminationDisplay {
  return mustGet(DETERMINATION_DISPLAY, method, "determination");
}

const DETERMINATION_DISPLAY: Record<DeterminationMethod, DeterminationDisplay> =
  {
    automated: {
      label: "Automated",
      description: "Status set by deterministic analysis — not an AI guess.",
      tone: "signal",
    },
    human_review: {
      label: "Human review",
      description:
        "A reviewer explicitly set this status — overrides automated results.",
      tone: "signal",
    },
  };

// ---------------------------------------------------------------------------
// Confidence / provenance / engine
// ---------------------------------------------------------------------------

export interface ConfidenceDisplay {
  description: string;
}

export function confidenceDisplay(confidence: Confidence): ConfidenceDisplay {
  return mustGet(CONFIDENCE_DISPLAY, confidence, "confidence");
}

const CONFIDENCE_DISPLAY: Record<Confidence, ConfidenceDisplay> = {
  high: {
    description:
      "Strong signal from the check — not a compliance status, but safe to act on.",
  },
  medium: {
    description: "Likely correct — skim the snippet before changing code.",
  },
  low: {
    description:
      "Weak or partial match — verify manually before treating as confirmed.",
  },
};

export interface ProvenanceDisplay {
  label: string;
  description: string;
  tone: StatusTone;
}

export function provenanceDisplay(
  provenance: ExplanationProvenance,
): ProvenanceDisplay {
  return mustGet(PROVENANCE_DISPLAY, provenance, "provenance");
}

const PROVENANCE_DISPLAY: Record<ExplanationProvenance, ProvenanceDisplay> = {
  deterministic: {
    label: "Deterministic",
    description:
      "Rule-based explanation from the check — baseline for compliance, not AI output.",
    tone: "signal",
  },
  ai: {
    label: "AI-generated",
    description:
      "Optional AI enrichment — never sets requirement status; review before trusting.",
    tone: "signal",
  },
};

export interface EngineDisplay {
  label: string;
  description: string;
  tone: StatusTone | null;
  badgeVariant: BadgeVariant;
}

export function engineDisplay(engine: AssessmentEngine): EngineDisplay {
  return mustGet(ENGINE_DISPLAY, engine, "assessment engine");
}

const ENGINE_DISPLAY: Record<AssessmentEngine, EngineDisplay> = {
  ast: {
    label: "Code",
    description: "Found in your code — fix the file and line shown.",
    tone: null,
    badgeVariant: "outline",
  },
  runtime: {
    label: "Live page",
    description:
      "Found on the live page — trace to the component that renders it.",
    tone: "signal",
    badgeVariant: undefined,
  },
};

// ---------------------------------------------------------------------------
// Org role tone
// ---------------------------------------------------------------------------

export function roleTone(role: OrgRole): StatusTone {
  return mustGet(ROLE_TONE, role, "org role");
}

const ROLE_TONE: Record<OrgRole, StatusTone> = {
  owner: "signal",
  admin: "review",
  member: "passed",
  viewer: "na",
};

/** Report CSS class for a requirement status, via its unified tone. */
export function requirementStatusReportClass(
  status: RequirementStatus,
): string {
  return mustGet(
    STATUS_TONE_REPORT_CLASS,
    requirementStatusDisplay(status).tone,
    "requirement status tone",
  );
}
