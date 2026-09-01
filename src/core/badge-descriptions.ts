import type { AssessmentEngine } from "./finding-types";
import type {
  Confidence,
  DeterminationMethod,
  ExplanationProvenance,
  RemediationStatus,
  RequirementStatus,
  Severity,
} from "./statuses";

export function requirementStatusDescription(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "This requirement is satisfied — deterministic checks or a human reviewer confirmed compliance.";
    case "failed":
      return "At least one finding failed this requirement — fix or dismiss findings before it can pass.";
    case "needs_review":
      return "Automated checks flagged ambiguity — a human should confirm pass or fail.";
    case "not_applicable":
      return "Marked out of scope for this project with a documented reason.";
    case "unable_to_verify":
      return "The check could not run or conclude — see the recorded reason, not a pass or fail.";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function remediationStatusDescription(status: RemediationStatus): string {
  switch (status) {
    case "detected":
      return "Finding recorded — no fix workflow started yet.";
    case "suggested":
      return "A fix is proposed (deterministic or AI) — review and approve before implementing.";
    case "approved":
      return "Fix approved — implement in code, then mark implemented.";
    case "implemented":
      return "Code change applied — re-assess or verify before closing the loop.";
    case "verified":
      return "Fix confirmed by automated re-check or human verification — remediation complete.";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}

export function severityDescription(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "Blocks core tasks for many users — prioritize immediately.";
    case "serious":
      return "Major barrier for some users — fix in the current sprint if possible.";
    case "moderate":
      return "Noticeable friction — schedule with other accessibility work.";
    case "minor":
      return "Low impact — fix when touching nearby code.";
    default: {
      const _exhaustive: never = severity;
      throw new Error(`Unhandled severity: ${_exhaustive}`);
    }
  }
}

export function confidenceDescription(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "Strong signal from the check — not a compliance status, but safe to act on.";
    case "medium":
      return "Likely correct — skim the snippet before changing code.";
    case "low":
      return "Weak or partial match — verify manually before treating as confirmed.";
    default: {
      const _exhaustive: never = confidence;
      throw new Error(`Unhandled confidence: ${_exhaustive}`);
    }
  }
}

export function determinationDescription(method: DeterminationMethod): string {
  switch (method) {
    case "automated":
      return "Status set by deterministic analysis — not an AI guess.";
    case "human_review":
      return "A reviewer explicitly set this status — overrides automated results.";
    default: {
      const _exhaustive: never = method;
      throw new Error(`Unhandled determination: ${_exhaustive}`);
    }
  }
}

export function provenanceDescription(provenance: ExplanationProvenance): string {
  switch (provenance) {
    case "deterministic":
      return "Rule-based explanation from the check — baseline for compliance, not AI output.";
    case "ai":
      return "Optional AI enrichment — never sets requirement status; review before trusting.";
    default: {
      const _exhaustive: never = provenance;
      throw new Error(`Unhandled provenance: ${_exhaustive}`);
    }
  }
}

export function engineDescription(engine: AssessmentEngine): string {
  switch (engine) {
    case "ast":
      return "Found in source code (AST) — fix the file and line shown.";
    case "runtime":
      return "Found on the rendered page (DOM audit) — trace to the component that renders it.";
    default: {
      const _exhaustive: never = engine;
      throw new Error(`Unhandled assessment engine: ${_exhaustive}`);
    }
  }
}
