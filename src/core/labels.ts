import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import type { RemediationStatus, RequirementStatus, Severity } from "@complyloop/analysis-core/contract/statuses";

export function requirementStatusLabel(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "needs_review":
      return "Needs review";
    case "not_applicable":
      return "Not applicable";
    case "unable_to_verify":
      return "Unable to verify";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function remediationStatusLabel(status: RemediationStatus): string {
  switch (status) {
    case "detected":
      return "Detected";
    case "suggested":
      return "Suggested";
    case "approved":
      return "Approved";
    case "implemented":
      return "Implemented";
    case "verified":
      return "Verified";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "serious":
      return 1;
    case "moderate":
      return 2;
    case "minor":
      return 3;
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}

export function evidenceKindLabel(kind: EvidenceKind): string {
  switch (kind) {
    case "project_connected":
      return "Project connected";
    case "project_disconnected":
      return "Project disconnected";
    case "project_reset":
      return "Project reset";
    case "assessment_completed":
      return "Assessment completed";
    case "assessment_job_queued":
      return "Assessment queued";
    case "assessment_job_completed":
      return "Assessment job completed";
    case "assessment_job_failed":
      return "Assessment job failed";
    case "finding_detected":
      return "Finding detected";
    case "finding_resolved":
      return "Finding resolved";
    case "finding_dismissed":
      return "Finding dismissed";
    case "remediation_approved":
      return "Remediation approved";
    case "remediation_implemented":
      return "Remediation implemented";
    case "remediation_verified":
      return "Remediation verified";
    case "remediation_manually_verified":
      return "Manually verified";
    case "ai_remediation_suggested":
      return "AI suggestion";
    case "ai_patch_ready":
      return "Patch ready";
    case "requirement_status_changed":
      return "Requirement status";
    case "requirement_exception_set":
      return "Exception recorded";
    case "requirement_exception_cleared":
      return "Exception cleared";
    case "requirement_human_passed":
      return "Human pass";
    case "requirement_human_pass_cleared":
      return "Human pass cleared";
    case "requirements_imported":
      return "Scope updated";
    case "pull_request_prepared":
      return "Pull request prepared";
    case "monitoring_changes_detected":
      return "Repo changes detected";
    case "webhook_reassessment":
      return "Webhook reassessment";
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled evidence kind: ${_exhaustive}`);
    }
  }
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "serious":
      return "Serious";
    case "moderate":
      return "Moderate";
    case "minor":
      return "Minor";
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}
