import type { AnalyzerId } from "../contract/finding-types.ts";
import type { Confidence, Severity } from "../contract/statuses.ts";
import type { CheckId, RawFinding } from "../types.ts";

export interface RawFindingFromDomInput {
  checkId: CheckId;
  kind: RawFinding["kind"];
  severity: Severity;
  confidence: Confidence;
  reason: string;
  url: string;
  selector: string;
  snippet: string;
  elementLabel?: string;
  context?: string;
  analyzerId: AnalyzerId;
  analyzerRuleId?: string;
  analyzerVersion?: string;
  validationInput?: string;
  validationRules?: string[];
  doctypeIncludedInInput?: boolean;
}

/** Shared runtime `dom` finding constructor for axe, custom probes, and html-validate. */
export function rawFindingFromDom(input: RawFindingFromDomInput): RawFinding {
  return {
    checkId: input.checkId,
    kind: input.kind,
    severity: input.severity,
    confidence: input.confidence,
    reason: input.reason,
    location: {
      kind: "dom",
      url: input.url,
      selector: input.selector,
      snippet: input.snippet,
      elementLabel: input.elementLabel,
      context: input.context,
    },
    fix: null,
    engine: "runtime",
    analyzerId: input.analyzerId,
    analyzerRuleId: input.analyzerRuleId,
    analyzerVersion: input.analyzerVersion,
    validationInput: input.validationInput,
    validationRules: input.validationRules,
    doctypeIncludedInInput: input.doctypeIncludedInInput,
  };
}
