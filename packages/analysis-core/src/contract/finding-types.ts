import type { Confidence, ExplanationProvenance } from "./statuses.ts";

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

/** Coarse engine bucket derived from the analyzer that produced the finding. */
export function engineFromAnalyzer(
  analyzerId: AnalyzerId | undefined,
): AssessmentEngine {
  switch (analyzerId) {
    case "axe":
    case "html-validate":
    case "playwright-custom":
    case "site-level":
    case "linkinator":
      return "runtime";
    case "ast":
    case "jsx-a11y":
    case undefined:
      return "ast";
    default: {
      const _exhaustive: never = analyzerId;
      throw new Error(`Unhandled analyzer: ${_exhaustive}`);
    }
  }
}

/**
 * Engine for a persisted finding: derived from `analyzerId`, with a fallback
 * to a stored `engine` (legacy rows predate analyzerId) and `"ast"` last.
 */
export function engineFor(finding: {
  analyzerId?: AnalyzerId;
  engine?: AssessmentEngine | string;
}): AssessmentEngine {
  if (finding.analyzerId) return engineFromAnalyzer(finding.analyzerId);
  const stored = finding.engine;
  if (stored === "runtime" || stored === "ast") return stored;
  return "ast";
}

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

export const DISMISSAL_REASONS = [
  "false_positive",
  "not_applicable",
  "accepted_risk",
] as const;

export interface Dismissal {
  reason: (typeof DISMISSAL_REASONS)[number];
  note: string;
  at: string;
}

export function isDismissalReason(
  value: unknown,
): value is Dismissal["reason"] {
  return (
    typeof value === "string" &&
    (DISMISSAL_REASONS as readonly string[]).includes(value)
  );
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