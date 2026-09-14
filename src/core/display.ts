/**
 * Canonical entry point for display vocabulary: `@/core/display`.
 * Status/evidence/report tones and text — no zod, no server, safe for
 * client components.
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
