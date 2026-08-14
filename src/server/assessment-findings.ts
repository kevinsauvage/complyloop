import { guidanceFor } from "@/adapters/rgaa/guidance";
import { deterministicExplanation } from "@/ai/explainer";
import type { RawFinding } from "@/analysis/types";
import { formatLocationRef } from "@/core/location";
import type { Project } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { addEvidence, type Db } from "./db";
import {
  buildSuggestion,
  filterAstFindingsForAuthority,
} from "./assessment-helpers";

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
    detail: { engine: raw.engine ?? "ast" },
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
