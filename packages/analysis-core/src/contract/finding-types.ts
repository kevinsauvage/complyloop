import type {
  Confidence,
  ExplanationProvenance,
  FindingKind,
  FindingStatus,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "./statuses.ts";

/** Which analyzer produced an observation (finer than `engine`). */
export type AnalyzerId =
  | "ast"
  | "jsx-a11y"
  | "axe"
  | "html-validate"
  | "playwright-custom"
  | "site-level"
  | "linkinator";

export interface AnalyzerContribution {
  analyzerId: AnalyzerId;
  analyzerRuleId?: string;
  analyzerVersion?: string;
}

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

export interface Span {
  start: number;
  end: number;
}

/** Source-file location from AST analysis (CI / auto-fixable defects). */
export interface SourceLocation {
  kind: "source";
  filePath: string;
  line: number;
  column: number;
  snippet: string;
  /** Character span of the offending JSX element in the source file. */
  span: Span;
}

/**
 * Rendered-DOM location from a runtime (browser) audit.
 * Source of truth for composition-sensitive a11y rules when a preview URL is set.
 */
export interface DomLocation {
  kind: "dom";
  /** Absolute page URL that was audited. */
  url: string;
  /** Primary CSS/selector target from the audit engine. */
  selector: string;
  /** HTML snippet of the failing node. */
  snippet: string;
  /** Human-readable element identity, e.g. link “Contact”. */
  elementLabel?: string;
  /** Extra runtime context (e.g. what covers the focused control). */
  context?: string;
}

/** Cross-page observation from a multi-route runtime audit. */
export interface SiteLocation {
  kind: "site";
  pages: string[];
  detail: string;
}

/** Where a finding was observed — source AST, rendered DOM, or site-wide. */
export type FindingLocation = SourceLocation | DomLocation | SiteLocation;

/** Which analysis engine produced a finding (`analyzerId` is finer-grained). */
export type AssessmentEngine = "ast" | "runtime";

/** Which analysis engines contributed to an assessment run (derived from runtime scan). */
export interface AssessmentEngines {
  /** AST scan always runs. */
  ast: true;
  runtime: boolean;
  runtimePagesScanned?: number;
  /** Optional runtime passes that ran (empty when runtime did not run). */
  scanFeatures?: readonly (
    | "site_level"
    | "html_validate"
    | "link_check"
    | "theme_conditions"
  )[];
  themeConditions?: readonly string[];
  runtimeError?: string;
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
    }
  | {
      kind: "remove_attribute";
      attribute: string;
      /** Span of the attribute including leading whitespace. */
      span: Span;
    };

export interface Explanation {
  whyItFailed: string;
  impact: string;
  howToFix: string;
  provenance: ExplanationProvenance;
  /** Present for AI explanations; deterministic baseline may omit or use high. */
  confidence?: Confidence;
  model?: string;
  generatedAt: string;
}

export interface Dismissal {
  reason: "false_positive" | "not_applicable" | "accepted_risk";
  note: string;
  at: string;
}

export function isDismissalReason(
  value: unknown,
): value is Dismissal["reason"] {
  return (
    value === "false_positive" ||
    value === "not_applicable" ||
    value === "accepted_risk"
  );
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
