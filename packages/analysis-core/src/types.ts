import type { Confidence, FindingKind, Severity } from "./contract/statuses.ts";
import type {
  AnalyzerContribution,
  AnalyzerId,
  FindingLocation,
  ProposedFix,
} from "./contract/finding-types.ts";
import type { ParsedSource } from "./parse.ts";
import type { CheckId } from "./check-registry.ts";

export type { CheckId } from "./check-registry.ts";
export { CHECK_IDS } from "./check-registry.ts";

export interface RawFinding {
  checkId: CheckId;
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
}

export interface AccessibilityCheck {
  id: CheckId;
  run(source: ParsedSource): RawFinding[];
}
