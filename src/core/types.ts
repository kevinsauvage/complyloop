export type DeterminationMethod = "automated" | "human_review";

export type RequirementStatus =
  | "passed"
  | "failed"
  | "needs_review"
  | "not_applicable"
  | "unable_to_verify";

export type RemediationStatus =
  | "detected"
  | "investigating"
  | "suggested"
  | "approved"
  | "implemented"
  | "verified";

export type FindingStatus = "open" | "resolved" | "dismissed";

/** A violation fails the requirement; a warning needs human review. */
export type FindingKind = "violation" | "warning";

export type Severity = "critical" | "serious" | "moderate" | "minor";

export type Confidence = "high" | "medium" | "low";

export type ExplanationProvenance = "deterministic" | "ai";

export interface Framework {
  id: string;
  name: string;
  version: string;
}

export interface Control {
  id: string;
  frameworkId: string;
  /** Primary reference, e.g. "WCAG 1.1.1" */
  code: string;
  /** Secondary reference, e.g. "RGAA 1.1" */
  secondaryCode: string;
  title: string;
  description: string;
  /** Identifier of the automated check that evaluates this control, if any. */
  checkId: string | null;
}

/** Where the assessed tree comes from. */
export type ProjectSource = "sample" | "local" | "git" | "github";

export interface ProjectGitHubMeta {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** Absolute path scanned and written by remediations. */
  rootPath: string;
  source: ProjectSource;
  /**
   * Original user input: absolute local path, or git remote URL.
   * For `sample`, omitted. For `local`, usually equals `rootPath`.
   * For `github`, the canonical https://github.com/org/repo URL.
   */
  sourceRef?: string;
  createdAt: string;
  /**
   * Auth.js user id that connected this project. Undefined = shared demo
   * (sample / local path) visible without sign-in.
   */
  ownerUserId?: string;
  /** Present when source is `github`. */
  github?: ProjectGitHubMeta;
  /**
   * Control IDs in scope for this project. `undefined` means every control
   * on the connected frameworks is in scope.
   */
  inScopeControlIds?: string[];
}

export type RequirementExceptionReason =
  | "not_applicable"
  | "accepted_risk"
  | "compensating_control"
  | "temporary";

export interface RequirementException {
  reason: RequirementExceptionReason;
  note: string;
  at: string;
  /** ISO timestamp; when set, assessment clears the exception after this time. */
  expiresAt?: string;
}

export interface Requirement {
  id: string;
  projectId: string;
  controlId: string;
  status: RequirementStatus;
  determination: DeterminationMethod;
  updatedAt: string;
  /** Set when a human marks the requirement N/A or similar; blocks automated overwrite. */
  exception?: RequirementException;
}

export interface FileChange {
  filePath: string;
  /** Present when the tree is a git checkout. */
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
  summary: Record<RequirementStatus, number>;
  snapshot?: AssessmentSnapshot;
  /** Files that changed since the previous assessment, when detectable. */
  changesSincePrevious?: FileChange[];
}

export interface Span {
  start: number;
  end: number;
}

export interface CodeLocation {
  filePath: string;
  line: number;
  column: number;
  snippet: string;
  /** Character span of the offending JSX element in the source file. */
  span: Span;
}

export type ProposedFix =
  | {
      kind: "insert_attribute";
      attribute: string;
      value: string;
      /** True when a human should adjust the value (e.g. alt text) before applying. */
      editable: boolean;
      /** Span of the JSX opening element the attribute is inserted into. */
      span: Span;
    }
  | {
      kind: "replace_attribute_value";
      attribute: string;
      /** Exact source text that replaces the current attribute value. */
      replacementText: string;
      /** Span of the current attribute value expression. */
      span: Span;
    };

export interface Explanation {
  whyItFailed: string;
  impact: string;
  howToFix: string;
  provenance: ExplanationProvenance;
  model?: string;
  generatedAt: string;
}

export interface Dismissal {
  reason: "false_positive" | "not_applicable" | "accepted_risk";
  note: string;
  at: string;
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
  location: CodeLocation;
  fix: ProposedFix | null;
  explanations: Explanation[];
  detectedAt: string;
  resolvedNote?: string;
  dismissal?: Dismissal;
}

export interface RemediationSuggestion {
  description: string;
  /** The offending line as it would look after the fix. */
  proposedSnippet: string;
  provenance: ExplanationProvenance;
  confidence?: Confidence;
  model?: string;
  generatedAt?: string;
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
}

export type EvidenceKind =
  | "project_connected"
  | "project_disconnected"
  | "project_reset"
  | "assessment_completed"
  | "finding_detected"
  | "finding_resolved"
  | "finding_dismissed"
  | "remediation_approved"
  | "remediation_implemented"
  | "remediation_verified"
  | "remediation_manually_verified"
  | "ai_remediation_suggested"
  | "requirement_status_changed"
  | "requirement_exception_set"
  | "requirement_exception_cleared"
  | "requirements_imported"
  | "pull_request_prepared"
  | "monitoring_changes_detected";

/** Groups findings that share a common technical cause. */
export interface FindingCluster {
  id: string;
  label: string;
  checkId: string;
  /** Shared path prefix or file pattern, e.g. "components/" or "ProductCard.tsx". */
  sharedLocation: string;
  findingIds: string[];
  controlIds: string[];
}

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
