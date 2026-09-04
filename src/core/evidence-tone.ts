import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";

export type EvidenceTone = "default" | "pass" | "fail" | "review" | "signal";

export function evidenceTone(kind: EvidenceKind): EvidenceTone {
  switch (kind) {
    case "finding_resolved":
    case "remediation_verified":
    case "remediation_manually_verified":
    case "assessment_completed":
    case "assessment_job_completed":
    case "requirement_human_passed":
    case "ai_patch_ready":
      return "pass";
    case "finding_detected":
    case "assessment_job_failed":
    case "monitoring_changes_detected":
      return "fail";
    case "finding_dismissed":
    case "requirement_exception_set":
    case "requirement_status_changed":
      return "review";
    case "remediation_approved":
    case "remediation_implemented":
    case "ai_remediation_suggested":
    case "pull_request_prepared":
    case "assessment_job_queued":
    case "webhook_reassessment":
      return "signal";
    case "project_connected":
    case "project_disconnected":
    case "project_reset":
    case "requirement_exception_cleared":
    case "requirement_human_pass_cleared":
    case "requirements_imported":
      return "default";
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled evidence kind: ${_exhaustive}`);
    }
  }
}

export const EVIDENCE_TONE_DOT: Record<EvidenceTone, string> = {
  default: "bg-muted-foreground/40",
  pass: "bg-status-passed",
  fail: "bg-status-failed",
  review: "bg-status-review",
  signal: "bg-signal",
};

/** Matches `STATUS_TONE_BADGE` in `status-tone.ts`. */
export const EVIDENCE_TONE_BADGE: Record<EvidenceTone, string> = {
  default: "",
  pass: "border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25",
  fail: "border-transparent bg-status-failed/15 text-status-failed dark:bg-status-failed/25",
  review:
    "border-transparent bg-status-review/15 text-status-review dark:bg-status-review/25",
  signal: "border-transparent bg-signal/15 text-signal dark:bg-signal/25",
};
