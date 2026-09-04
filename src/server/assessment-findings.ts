import { guidanceFor } from "@/adapters/registry";
import { deterministicExplanation } from "@/ai/explainer";
import { filterAstFindingsForAuthority } from "@complyloop/analysis-core/merge-findings";
import type { RawFinding } from "@complyloop/analysis-core/types";
import { formatLocationRef } from "@/core/location";
import type { Project } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { addEvidence, type Db } from "./db";
import { buildSuggestion } from "./assessment-helpers";

export function createFinding(
  db: Db,
  project: Project,
  rootPath: string,
  controlId: string,
  assessmentId: string,
  raw: RawFinding,
): void {
  const now = new Date().toISOString();
  const guidance = guidanceFor(raw.checkId);
  const finding: Finding = {
    id: crypto.randomUUID(),
    projectId: project.id,
    controlId,
    assessmentId,
    checkId: raw.checkId,
    status: "open",
    kind: raw.kind,
    severity: raw.severity,
    confidence: raw.confidence,
    reason: raw.reason,
    location: raw.location,
    engine: raw.engine ?? "ast",
    analyzerId: raw.analyzerId,
    analyzerRuleId: raw.analyzerRuleId,
    analyzerVersion: raw.analyzerVersion,
    contributingAnalyzers: raw.contributingAnalyzers,
    fix: raw.fix,
    explanations: [deterministicExplanation(raw.reason, guidance)],
    detectedAt: now,
  };
  db.findings.push(finding);

  const suggestion = buildSuggestion(rootPath, raw);
  const remediation: Remediation = {
    id: crypto.randomUUID(),
    findingId: finding.id,
    status: suggestion ? "suggested" : "detected",
    suggestion,
    history: suggestion
      ? [
          { status: "detected", at: now },
          { status: "suggested", at: now, note: suggestion.description },
        ]
      : [{ status: "detected", at: now }],
  };
  db.remediations.push(remediation);

  addEvidence(db, {
    kind: "finding_detected",
    summary: `${raw.checkId}: ${formatLocationRef(raw.location)} — ${raw.reason}`,
    projectId: project.id,
    controlId,
    findingId: finding.id,
    assessmentId,
    detail: {
      engine: raw.engine ?? "ast",
      ...(raw.analyzerId ? { analyzerId: raw.analyzerId } : {}),
      ...(raw.analyzerRuleId ? { analyzerRuleId: raw.analyzerRuleId } : {}),
      ...(raw.analyzerVersion ? { analyzerVersion: raw.analyzerVersion } : {}),
      ...(raw.validationInput ? { validationInput: raw.validationInput } : {}),
      ...(raw.validationRules?.length
        ? { validationRules: raw.validationRules }
        : {}),
      ...(raw.doctypeIncludedInInput !== undefined
        ? { doctypeIncludedInInput: raw.doctypeIncludedInInput }
        : {}),
      ...(raw.contributingAnalyzers?.length
        ? { contributingAnalyzers: raw.contributingAnalyzers }
        : {}),
    },
  });
}

export function mergeRawFindings(
  astFindings: RawFinding[],
  runtimeFindings: RawFinding[],
  runtimeRan: boolean,
): RawFinding[] {
  const filteredAst = filterAstFindingsForAuthority(
    astFindings,
    runtimeRan,
  ).map((finding) => ({ ...finding, engine: finding.engine ?? ("ast" as const) }));
  return [...filteredAst, ...runtimeFindings];
}
