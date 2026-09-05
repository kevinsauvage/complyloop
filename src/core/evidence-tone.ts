import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { lookupExhaustive } from "./assert-exhaustive";
import { STATUS_TONE_BADGE } from "./status-tone";

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
