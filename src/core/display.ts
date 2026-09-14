/**
 * Compat re-export — prefer `@/core/display/status`, `…/evidence`, or
 * `…/report-tones` for new imports. This barrel preserves stable public
 * symbol names for one release after the vocabulary split.
 */
export type {
  BadgeVariant,
  ReportColorPair,
  StatusTone,
} from "./display/report-tones";
export {
  STATUS_TONE_ACCENT,
  STATUS_TONE_BADGE,
  STATUS_TONE_DOT,
  STATUS_TONE_REPORT,
  STATUS_TONE_REPORT_CLASS,
} from "./display/report-tones";

export type {
  ConfidenceDisplay,
  DeterminationDisplay,
  EngineDisplay,
  FindingStatusDisplay,
  ProvenanceDisplay,
  RemediationStatusDisplay,
  RequirementStatusDisplay,
  SeverityDisplay,
} from "./display/status";
export {
  confidenceDisplay,
  determinationDisplay,
  engineDisplay,
  findingStatusDisplay,
  provenanceDisplay,
  remediationStatusDisplay,
  requirementStatusDisplay,
  requirementStatusReportClass,
  roleTone,
  severityDisplay,
} from "./display/status";

export type { EvidenceDisplay, EvidenceTone } from "./display/evidence";
export {
  EVIDENCE_TONE_BADGE,
  EVIDENCE_TONE_DOT,
  evidenceDisplay,
} from "./display/evidence";
