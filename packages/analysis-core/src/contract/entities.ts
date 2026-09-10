import type {
  AnalyzerContribution,
  AnalyzerId,
  AssessmentEngines,
  Dismissal,
  Explanation,
  FindingLocation,
  ProposedFix,
  RemediationSuggestion,
} from "./finding-types.ts";
import type {
  Confidence,
  FindingKind,
  FindingStatus,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "./statuses.ts";

export interface FileChange {
  filePath: string;
}

export interface AssessmentSnapshot {
  /** Relative path → content hash for source files at assessment time. */
  fileHashes: Record<string, string>;
  gitHead?: string;
  /**
   * Fingerprint of the assessed control scope + AST check registry at snapshot
   * time. Lets a re-assessment at the same `gitHead` reuse prior AST findings
   * and skip a full source scan when sources, scope, and engine set are all
   * unchanged.
   */
  controlScopeKey?: string;
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

/**
 * A persisted finding: observation fields + persistence envelope
 * (id, project, control, assessment, status, lifecycle). `engine` is not
 * stored — it is derived from `analyzerId` via `engineFor` at the UI/filter
 * boundaries. `checkId` is kept loose because persisted rows may predate the
 * check registry (which `RawFinding` keys strictly).
 */
export interface Finding {
  id: string;
  projectId: string;
  controlId: string;
  assessmentId: string;
  /** Persisted rows may predate the registry — keep the loose string here. */
  checkId: string;
  kind: FindingKind;
  severity: Severity;
  confidence: Confidence;
  reason: string;
  location: FindingLocation;
  fix: ProposedFix | null;
  /** Analyzer that produced this observation (AST checks default to `ast`). */
  analyzerId?: AnalyzerId;
  /** axe / html-validate / jsx-a11y rule id, or custom probe check id. */
  analyzerRuleId?: string;
  /** Package version of the analyzer when cheap to resolve. */
  analyzerVersion?: string;
  /** What was validated (e.g. live DOM serialization vs source HTML). */
  validationInput?: string;
  /** Rule ids enabled for this validation pass. */
  validationRules?: string[];
  /** Whether a doctype was included in the validated string. */
  doctypeIncludedInInput?: boolean;
  /** Other analyzers merged into this finding during runtime dedupe. */
  contributingAnalyzers?: AnalyzerContribution[];
  status: FindingStatus;
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

/**
 * Frozen, append-only vocabulary for evidence rows. Do NOT add members: the
 * set below is historical and never rewritten. Record a new product event by
 * reusing a general kind — `finding`, `assessment_job`, or
 * `requirement_status_changed` — with a `detail` discriminant (e.g.
 * `detail.event`, `detail.phase`), and add its label/tone alongside in
 * `src/core/display.ts`'s `evidenceDisplay`. Evidence-page filter
 * chips are a separate short allow-list (`EVIDENCE_KIND_FILTER_ORDER`), not
 * this type.
 */
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
  /** GitHub login or user id of the author; undefined = automated. */
  actor?: string;
  detail?: Record<string, unknown>;
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
