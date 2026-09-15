import type { CheckId } from "../check-registry.ts";
import type { AnalyzerId } from "../contract/finding-types.ts";
import type { Confidence, Severity } from "../contract/statuses.ts";
import type { RawFinding } from "../types.ts";

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

/**
 * JSONB-safe text: JSON (and Postgres' jsonb parser) forbids raw control
 * characters (U+0000–U+001F) inside strings. DOM content is external input
 * (attribute values, rendered HTML) that can legally contain such bytes in
 * the wild; strip them at this conversion boundary so a single hostile element
 * cannot fail the whole assessment persist (PG error "unsupported Unicode
 * escape sequence" on `\u0000`).
 */
function jsonbSafe(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
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
      selector: jsonbSafe(input.selector),
      snippet: jsonbSafe(input.snippet),
      elementLabel: input.elementLabel
        ? jsonbSafe(input.elementLabel)
        : undefined,
      context: input.context ? jsonbSafe(input.context) : undefined,
    },
    fix: null,
    analyzerId: input.analyzerId,
    analyzerRuleId: input.analyzerRuleId,
    analyzerVersion: input.analyzerVersion,
    validationInput: input.validationInput,
    validationRules: input.validationRules,
    doctypeIncludedInInput: input.doctypeIncludedInInput,
  };
}
