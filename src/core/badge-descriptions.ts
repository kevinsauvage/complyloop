import type { AssessmentEngine } from "@complyloop/analysis-core/contract/finding-types";
import type {
  Confidence,
  DeterminationMethod,
  ExplanationProvenance,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";

export function requirementStatusDescription(status: RequirementStatus): string {
  return REQUIREMENT_STATUS_DESCRIPTION[status] ?? assertExhaustive(status, "requirement status");
}

const REQUIREMENT_STATUS_DESCRIPTION: Record<RequirementStatus, string> = {
  passed: "This requirement is satisfied — deterministic checks or a human reviewer confirmed compliance.",
  failed: "At least one finding failed this requirement — fix or dismiss findings before it can pass.",
  needs_review: "Automated checks flagged ambiguity — a human should confirm pass or fail.",
  not_applicable: "Marked out of scope for this project with a documented reason.",
  unable_to_verify: "The check could not run or conclude — see the recorded reason, not a pass or fail.",
};

export function remediationStatusDescription(status: RemediationStatus): string {
  return REMEDIATION_STATUS_DESCRIPTION[status] ?? assertExhaustive(status, "remediation status");
}

const REMEDIATION_STATUS_DESCRIPTION: Record<RemediationStatus, string> = {
  detected: "Finding recorded — no fix workflow started yet.",
  suggested: "A fix is proposed (deterministic or AI) — review and approve before implementing.",
  approved: "Fix approved — implement in code, then mark implemented.",
  implemented: "Code change applied — re-assess or verify before closing the loop.",
  verified: "Fix confirmed by automated re-check or human verification — remediation complete.",
};

export function severityDescription(severity: Severity): string {
  return SEVERITY_DESCRIPTION[severity] ?? assertExhaustive(severity, "severity");
}

const SEVERITY_DESCRIPTION: Record<Severity, string> = {
  critical: "Blocks core tasks for many users — prioritize immediately.",
  serious: "Major barrier for some users — fix in the current sprint if possible.",
  moderate: "Noticeable friction — schedule with other accessibility work.",
  minor: "Low impact — fix when touching nearby code.",
};

export function confidenceDescription(confidence: Confidence): string {
  return CONFIDENCE_DESCRIPTION[confidence] ?? assertExhaustive(confidence, "confidence");
}

const CONFIDENCE_DESCRIPTION: Record<Confidence, string> = {
  high: "Strong signal from the check — not a compliance status, but safe to act on.",
  medium: "Likely correct — skim the snippet before changing code.",
  low: "Weak or partial match — verify manually before treating as confirmed.",
};

export function determinationDescription(method: DeterminationMethod): string {
  return DETERMINATION_DESCRIPTION[method] ?? assertExhaustive(method, "determination");
}

const DETERMINATION_DESCRIPTION: Record<DeterminationMethod, string> = {
  automated: "Status set by deterministic analysis — not an AI guess.",
  human_review: "A reviewer explicitly set this status — overrides automated results.",
};

export function provenanceDescription(provenance: ExplanationProvenance): string {
  return PROVENANCE_DESCRIPTION[provenance] ?? assertExhaustive(provenance, "provenance");
}

const PROVENANCE_DESCRIPTION: Record<ExplanationProvenance, string> = {
  deterministic: "Rule-based explanation from the check — baseline for compliance, not AI output.",
  ai: "Optional AI enrichment — never sets requirement status; review before trusting.",
};

export function engineDescription(engine: AssessmentEngine): string {
  return ENGINE_DESCRIPTION[engine] ?? assertExhaustive(engine, "assessment engine");
}

const ENGINE_DESCRIPTION: Record<AssessmentEngine, string> = {
  ast: "Found in source code (AST) — fix the file and line shown.",
  runtime: "Found on the rendered page (DOM audit) — trace to the component that renders it.",
};

function assertExhaustive(value: string, kind: string): never {
  throw new Error(`Unhandled ${kind}: ${value}`);
}
