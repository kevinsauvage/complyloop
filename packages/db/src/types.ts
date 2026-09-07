import type { OrgMembership, Organization, Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import type {
  AnalyzerContribution,
  AnalyzerId,
  AssessmentEngine,
  AssessmentEngines,
  Dismissal,
  Explanation,
  FindingLocation,
  ProposedFix,
  RemediationSuggestion,
} from "@complyloop/analysis-core/contract/finding-types";
import type {
  Confidence,
  FindingKind,
  FindingStatus,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";

// PublicError is a cross-cutting HTTP/UI concern whose implementation is
// shared with the analysis-core scan layer (runtime audits throw it). To keep
// analysis-core free of a dependency on db (no cycle), the class stays there
// and db re-exports it as the canonical app-facing location.
export { PublicError, isPublicError, publicMessage } from "@complyloop/analysis-core/contract/public-error";

export interface FileChange {
  filePath: string;
  /** Legacy fields from older assessments; new runs record gitHead on the snapshot instead. */
  author?: string;
  commitSha?: string;
  commitSubject?: string;
}

export interface AssessmentSnapshot {
  /** Relative path → content hash for source files at assessment time. */
  fileHashes: Record<string, string>;
  gitHead?: string;
}

export interface Assessment {
  id: string;
  projectId: string;
  startedAt: string;
  completedAt: string;
  filesScanned: number;
  /** Whether this run scanned the full tree or only changed JSX files. */
  scanMode?: "full" | "scoped";
  /** Which engines ran (AST always; runtime when a preview URL is configured). */
  engines?: AssessmentEngines;
  summary: Record<RequirementStatus, number>;
  snapshot?: AssessmentSnapshot;
  /** Files that changed since the previous assessment, when detectable. */
  changesSincePrevious?: FileChange[];
}

export interface Finding {
  id: string;
  projectId: string;
  controlId: string;
  assessmentId: string;
  checkId: string;
  status: FindingStatus;
  kind: FindingKind;
  severity: Severity;
  confidence: Confidence;
  reason: string;
  location: FindingLocation;
  /** Detection engine that produced this finding. */
  engine?: AssessmentEngine;
  /** Finer-grained analyzer id; `engine` is derived when absent (`analyzerId` starting with axe/html-validate → runtime). */
  analyzerId?: AnalyzerId;
  analyzerRuleId?: string;
  analyzerVersion?: string;
  contributingAnalyzers?: AnalyzerContribution[];
  fix: ProposedFix | null;
  explanations: Explanation[];
  detectedAt: string;
  /**
   * Last-write timestamp for stale-write protection. Set on every upsert by
   * the repo layer; a concurrent write with a newer `updatedAt` wins, so a
   * webhook assessment applying a stale slice cannot revert a human decision.
   * Optional: legacy rows without it write unconditionally.
   */
  updatedAt?: string;
  resolvedNote?: string;
  dismissal?: Dismissal;
}

export interface RemediationHistoryEntry {
  status: RemediationStatus;
  at: string;
  note?: string;
}

export interface Remediation {
  id: string;
  findingId: string;
  status: RemediationStatus;
  suggestion: RemediationSuggestion | null;
  history: RemediationHistoryEntry[];
  /** Local to the payload so reassessment can verify without evidence history. */
  approvalAction?: "create_draft_pull_request";
  /**
   * Last-write timestamp for stale-write protection (set on every upsert by the
   * repo layer, like `Finding.updatedAt`). Optional for legacy rows.
   */
  updatedAt?: string;
}

export type EvidenceKind =
  | "project_connected"
  | "project_disconnected"
  | "project_reset"
  | "assessment_completed"
  | "assessment_job"
  | "finding"
  | "remediation_approved"
  | "remediation_implemented"
  | "remediation_verified"
  | "remediation_manually_verified"
  | "ai_remediation_suggested"
  | "ai_patch_ready"
  | "requirement_status_changed"
  | "requirement_exception_set"
  | "requirement_exception_cleared"
  | "requirement_human_passed"
  | "requirement_human_pass_cleared"
  | "requirements_imported"
  | "pull_request_prepared"
  | "monitoring_changes_detected"
  | "webhook_reassessment";

export interface EvidenceRecord {
  id: string;
  at: string;
  kind: EvidenceKind;
  summary: string;
  projectId?: string;
  controlId?: string;
  findingId?: string;
  assessmentId?: string;
  detail?: Record<string, unknown>;
}

/** Groups findings that share a common technical cause. */
export interface FindingCluster {
  id: string;
  label: string;
  checkId: string;
  /** Shared path prefix or file pattern, e.g. "components/" or "ProductCard.tsx". */
  sharedLocation: string;
  findingIds: string[];
  controlIds: string[];
  /** How many open findings this cluster covers. */
  occurrenceCount?: number;
  /** Priority score (higher = fix first). */
  priorityScore?: number;
}

export type AlertKind = "compliance_regression";

/** User-facing alert produced by continuous monitoring / webhooks. */
export interface Alert {
  id: string;
  projectId: string;
  kind: AlertKind;
  summary: string;
  at: string;
  read: boolean;
  assessmentId?: string;
  detail?: Record<string, unknown>;
}

/**
 * In-memory read model for workspace pages and domain helpers during mutations.
 * Persist changes via row-level repo functions — never bulk-sync this object.
 */
export interface Db {
  organizations: Organization[];
  memberships: OrgMembership[];
  projects: Project[];
  requirements: Requirement[];
  assessments: Assessment[];
  findings: Finding[];
  remediations: Remediation[];
  evidence: EvidenceRecord[];
  /** Regression / monitoring alerts (append-friendly, markable as read). */
  alerts: Alert[];
}

export function emptyDb(): Db {
  return {
    organizations: [],
    memberships: [],
    projects: [],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}