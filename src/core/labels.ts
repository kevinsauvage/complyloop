import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import type { RemediationStatus, RequirementStatus, Severity } from "@complyloop/analysis-core/contract/statuses";

export function requirementStatusLabel(status: RequirementStatus): string {
  return REQUIREMENT_STATUS_LABEL[status] ?? assertExhaustive(status, "requirement status");
}

const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  needs_review: "Needs review",
  not_applicable: "Not applicable",
  unable_to_verify: "Unable to verify",
};

export function remediationStatusLabel(status: RemediationStatus): string {
  return REMEDIATION_STATUS_LABEL[status] ?? assertExhaustive(status, "remediation status");
}

export const REMEDIATION_STATUS_LABEL: Record<RemediationStatus, string> = {
  detected: "Detected",
  suggested: "Suggested",
  approved: "Approved",
  implemented: "Implemented",
  verified: "Verified",
};

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? assertExhaustive(severity, "severity");
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export function severityLabel(severity: Severity): string {
  return SEVERITY_LABEL[severity] ?? assertExhaustive(severity, "severity");
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
};

export function evidenceKindLabel(kind: EvidenceKind): string {
  return EVIDENCE_KIND_LABEL[kind] ?? assertExhaustive(kind, "evidence kind");
}

const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  project_connected: "Project connected",
  project_disconnected: "Project disconnected",
  project_reset: "Project reset",
  assessment_completed: "Assessment completed",
  assessment_job_queued: "Assessment queued",
  assessment_job_completed: "Assessment job completed",
  assessment_job_failed: "Assessment job failed",
  finding_detected: "Finding detected",
  finding_resolved: "Finding resolved",
  finding_dismissed: "Finding dismissed",
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

function assertExhaustive(value: string, kind: string): never {
  throw new Error(`Unhandled ${kind}: ${value}`);
}
