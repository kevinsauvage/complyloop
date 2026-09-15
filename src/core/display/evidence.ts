import type { EvidenceKind } from "@complyloop/analysis-core/contract/entities";

import { mustGet } from "./must-get";
import { STATUS_TONE_BADGE, STATUS_TONE_DOT } from "./report-tones";

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
  requirement_exception_cleared: {
    label: "Exception cleared",
    tone: "default",
  },
  requirement_human_passed: { label: "Human pass", tone: "pass" },
  requirement_human_pass_cleared: {
    label: "Human pass cleared",
    tone: "default",
  },
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
  cancelled: { label: "Assessment job cancelled", tone: "default" },
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
  pass: STATUS_TONE_DOT.passed,
  fail: STATUS_TONE_DOT.failed,
  review: STATUS_TONE_DOT.review,
  signal: STATUS_TONE_DOT.signal,
};

export const EVIDENCE_TONE_BADGE: Record<EvidenceTone, string> = {
  default: "",
  pass: STATUS_TONE_BADGE.passed,
  fail: STATUS_TONE_BADGE.failed,
  review: STATUS_TONE_BADGE.review,
  signal: STATUS_TONE_BADGE.signal,
};
