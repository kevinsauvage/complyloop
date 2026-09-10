import type { EvidenceKind } from "@complyloop/db/types";
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

function mustGet<T extends string, V>(
  record: Record<T, V>,
  key: string,
  kind: string,
): V {
  const value = record[key as T];
  if (value === undefined) {
    throw new Error(`Unhandled ${kind}: ${key}`);
  }
  return value;
}

/**
 * Display data lives as one record per enum value: `{ label, description,
 * tone? }`. Adding a status edits a single table; badges read tone via
 * `STATUS_TONE_BADGE` — no parallel color maps.
 */

export type StatusTone =
  | "passed"
  | "failed"
  | "review"
  | "na"
  | "unverifiable"
  | "signal";

export type BadgeVariant = "secondary" | "outline" | undefined;

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
  return mustGet(
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
  return mustGet(
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
    description: "Noticeable friction — schedule with other accessibility work.",
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

/** Hex pair for the standalone HTML report, which has no Tailwind tokens. */
export interface ReportColorPair {
  fg: string;
  bg: string;
}

/**
 * The one tone table: every surface that renders a status tone — in-app badge
 * fill/text, accent bar, evidence dot, and the print/email report palette —
 * reads from here. Retune a tone once; the exported lookups below derive.
 */
interface StatusToneStyle {
  badge: string;
  accent: string;
  dot: string;
  report: ReportColorPair | null;
  reportClass: string | null;
}

const STATUS_TONE_STYLE = {
  passed: {
    badge:
      "border-transparent bg-status-passed/25 text-status-passed dark:bg-status-passed/25",
    accent: "bg-status-passed",
    dot: "bg-status-passed",
    report: { fg: "#15803d", bg: "#dcfce7" },
    reportClass: "status-passed",
  },
  failed: {
    badge:
      "border-transparent bg-status-failed/25 text-status-failed dark:bg-status-failed/25",
    accent: "bg-status-failed",
    dot: "bg-status-failed",
    report: { fg: "#b91c1c", bg: "#fee2e2" },
    reportClass: "status-failed",
  },
  review: {
    badge:
      "border-transparent bg-status-review/25 text-status-review dark:bg-status-review/25",
    accent: "bg-status-review",
    dot: "bg-status-review",
    report: { fg: "#b45309", bg: "#fef3c7" },
    reportClass: "status-needs-review",
  },
  na: {
    badge: "border-transparent bg-status-na/25 text-status-na dark:bg-status-na/25",
    accent: "bg-status-na",
    dot: "bg-status-na",
    report: { fg: "#475569", bg: "#f1f5f9" },
    reportClass: "status-not-applicable",
  },
  unverifiable: {
    badge:
      "border-transparent bg-status-unverifiable/25 text-status-unverifiable dark:bg-status-unverifiable/25",
    accent: "bg-status-unverifiable",
    dot: "bg-status-unverifiable",
    report: { fg: "#6d28d9", bg: "#ede9fe" },
    reportClass: "status-unable",
  },
  signal: {
    badge: "border-transparent bg-signal/25 text-signal dark:bg-signal/25",
    accent: "bg-signal",
    dot: "bg-signal",
    // `signal` is informational and never appears in a status report, so it
    // carries no report palette.
    report: null,
    reportClass: null,
  },
} satisfies Record<StatusTone, StatusToneStyle>;

type SignallessTone = Exclude<StatusTone, "signal">;

function toneStyle(tone: StatusTone): StatusToneStyle {
  return mustGet(STATUS_TONE_STYLE, tone, "status tone");
}

function requiredReport(tone: SignallessTone): ReportColorPair {
  const pair = toneStyle(tone).report;
  if (!pair) throw new Error(`Missing report palette: ${tone}`);
  return pair;
}

function requiredReportClass(tone: SignallessTone): string {
  const value = toneStyle(tone).reportClass;
  if (!value) throw new Error(`Missing report class: ${tone}`);
  return value;
}

/** Soft tint + readable text; stronger fill in dark mode for contrast. */
export const STATUS_TONE_BADGE: Record<StatusTone, string> = {
  passed: toneStyle("passed").badge,
  failed: toneStyle("failed").badge,
  review: toneStyle("review").badge,
  na: toneStyle("na").badge,
  unverifiable: toneStyle("unverifiable").badge,
  signal: toneStyle("signal").badge,
};

export const STATUS_TONE_ACCENT: Record<SignallessTone, string> = {
  passed: toneStyle("passed").accent,
  failed: toneStyle("failed").accent,
  review: toneStyle("review").accent,
  na: toneStyle("na").accent,
  unverifiable: toneStyle("unverifiable").accent,
};

/** Print/email hex palette per requirement tone (Tailwind unavailable). */
export const STATUS_TONE_REPORT: Record<SignallessTone, ReportColorPair> = {
  passed: requiredReport("passed"),
  failed: requiredReport("failed"),
  review: requiredReport("review"),
  na: requiredReport("na"),
  unverifiable: requiredReport("unverifiable"),
};

/** CSS badge class suffix per tone in the standalone report. */
export const STATUS_TONE_REPORT_CLASS: Record<SignallessTone, string> = {
  passed: requiredReportClass("passed"),
  failed: requiredReportClass("failed"),
  review: requiredReportClass("review"),
  na: requiredReportClass("na"),
  unverifiable: requiredReportClass("unverifiable"),
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

// ---------------------------------------------------------------------------
// Evidence — one record per kind; `finding` and `assessment_job` refine
// label + tone together from `detail`, so the two stay in sync.
// ---------------------------------------------------------------------------

export type EvidenceTone = "default" | "pass" | "fail" | "review" | "signal";

export interface EvidenceDisplay {
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
  return mustGet(EVIDENCE_DISPLAY, kind, "evidence kind");
}

export const EVIDENCE_TONE_DOT: Record<EvidenceTone, string> = {
  default: "bg-muted-foreground/40",
  pass: STATUS_TONE_STYLE.passed.dot,
  fail: STATUS_TONE_STYLE.failed.dot,
  review: STATUS_TONE_STYLE.review.dot,
  signal: STATUS_TONE_STYLE.signal.dot,
};

export const EVIDENCE_TONE_BADGE: Record<EvidenceTone, string> = {
  default: "",
  pass: STATUS_TONE_STYLE.passed.badge,
  fail: STATUS_TONE_STYLE.failed.badge,
  review: STATUS_TONE_STYLE.review.badge,
  signal: STATUS_TONE_STYLE.signal.badge,
};
