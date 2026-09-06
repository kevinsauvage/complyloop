import fs from "node:fs";
import { guidanceFor } from "@complyloop/adapters/registry";
import { deterministicExplanation } from "@/ai/explainer";
import { describeFix, previewFixedLine } from "@complyloop/analysis-core/fixes";
import { filterAstFindingsForAuthority } from "@complyloop/analysis-core/merge-findings";
import { scanFile } from "@complyloop/analysis-core/scan";
import type { RawFinding } from "@complyloop/analysis-core/types";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import {
  formatLocationRef,
  isDomLocation,
  isSiteLocation,
  isSourceLocation,
} from "@complyloop/analysis-core/contract/location";
import type { Control, Project } from "@complyloop/analysis-core/contract/project-types";
import type { Finding, Remediation } from "@complyloop/db/types"
import type { FindingLocation, ProposedFix, RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import { addEvidence, type Db } from "./db";

/**
 * Findings are matched across assessments by location identity so remediation
 * state survives re-assessment and dismissals stick.
 */
export function sameInstance(
  finding: { location: FindingLocation },
  raw: { location: FindingLocation },
): boolean {
  const left = finding.location;
  const right = raw.location;
  if (left.kind !== right.kind) return false;
  if (isSourceLocation(left) && isSourceLocation(right)) {
    return (
      left.filePath === right.filePath &&
      (left.snippet === right.snippet || left.line === right.line)
    );
  }
  if (isDomLocation(left) && isDomLocation(right)) {
    return (
      left.url === right.url &&
      (left.selector === right.selector || left.snippet === right.snippet)
    );
  }
  if (isSiteLocation(left) && isSiteLocation(right)) {
    return (
      left.detail === right.detail &&
      left.pages.length === right.pages.length &&
      left.pages.every((page, index) => page === right.pages[index])
    );
  }
  return false;
}

/** Carries a human-edited fix value over to the freshly scanned fix. */
export function mergeFix(
  existing: ProposedFix | null,
  fresh: ProposedFix | null,
): ProposedFix | null {
  if (
    existing?.kind === "insert_attribute" &&
    fresh?.kind === "insert_attribute" &&
    existing.editable
  ) {
    return { ...fresh, value: existing.value };
  }
  return fresh;
}

/**
 * Re-scans the finding's file and re-locates this violation instance (by
 * snippet, then line) so fixes use current character offsets after drift.
 * Warnings are ignored — they carry no fix. DOM findings are not relocatable here.
 */
export function locateViolationInProject(
  rootPath: string,
  finding: Pick<Finding, "checkId" | "location">,
): RawFinding | undefined {
  const location = finding.location;
  if (!isSourceLocation(location)) return undefined;
  const violations = scanFile(rootPath, location.filePath).filter(
    (candidate) =>
      candidate.checkId === finding.checkId && candidate.kind === "violation",
  );
  return violations.find((candidate) => {
    if (!isSourceLocation(candidate.location)) return false;
    return (
      candidate.location.snippet === location.snippet ||
      candidate.location.line === location.line
    );
  });
}

export function buildSuggestion(
  rootPath: string,
  raw: Pick<RawFinding, "location" | "fix">,
): RemediationSuggestion | null {
  if (!raw.fix) return null;
  if (!isSourceLocation(raw.location)) return null;
  const text = fs.readFileSync(
    resolveInside(rootPath, raw.location.filePath),
    "utf8",
  );
  return {
    description: describeFix(raw.fix),
    proposedSnippet: previewFixedLine(text, raw.fix, raw.location.line),
    provenance: "deterministic",
    confidence: "high",
    generatedAt: new Date().toISOString(),
  };
}

function findingLocationMatchesScope(
  location: FindingLocation,
  scopedFileSet: Set<string> | null,
): boolean {
  if (!scopedFileSet) return true;
  if (!isSourceLocation(location)) return true;
  return scopedFileSet.has(location.filePath);
}

export interface ReconcileControlFindingsInput {
  db: Db;
  project: Project;
  control: Control;
  assessmentId: string;
  rootPath: string;
  rawForControl: RawFinding[];
  scopedFileSet: Set<string> | null;
  runtimeRan: boolean;
  onFindingResolved: (finding: Finding) => void;
}

function isRuntimeOwnedFinding(finding: Finding): boolean {
  if (finding.engine === "runtime") return true;
  return (
    isDomLocation(finding.location) || isSiteLocation(finding.location)
  );
}

/** Pure decision: should an unmatched open finding be resolved this run? */
export function shouldResolveOpenFinding(input: {
  finding: Finding;
  scopedFileSet: Set<string> | null;
  runtimeRan: boolean;
}): boolean {
  if (isRuntimeOwnedFinding(input.finding)) {
    return input.runtimeRan;
  }
  if (
    !findingLocationMatchesScope(input.finding.location, input.scopedFileSet)
  ) {
    return false;
  }
  return true;
}

/**
 * Matches raw scan hits to open findings, creates new ones, and resolves
 * opens that no longer appear — for one control in one assessment run.
 */
export function reconcileControlFindings(
  input: ReconcileControlFindingsInput,
): void {
  const {
    db,
    project,
    control,
    assessmentId,
    rootPath,
    rawForControl,
    scopedFileSet,
    runtimeRan,
    onFindingResolved,
  } = input;
  const projectId = project.id;

  const openFindings = db.findings.filter(
    (finding) =>
      finding.projectId === projectId &&
      finding.controlId === control.id &&
      finding.status === "open",
  );
  const dismissedFindings = db.findings.filter(
    (finding) =>
      finding.projectId === projectId &&
      finding.controlId === control.id &&
      finding.status === "dismissed",
  );

  const matchedIds = new Set<string>();
  for (const raw of rawForControl) {
    if (dismissedFindings.some((finding) => sameInstance(finding, raw))) {
      continue;
    }
    const existing = openFindings.find(
      (finding) => !matchedIds.has(finding.id) && sameInstance(finding, raw),
    );
    if (existing) {
      matchedIds.add(existing.id);
      existing.assessmentId = assessmentId;
      existing.fix = mergeFix(existing.fix, raw.fix);
      existing.location = raw.location;
      existing.engine = raw.engine ?? existing.engine ?? "ast";
    } else {
      createFinding(db, project, rootPath, control.id, assessmentId, raw);
    }
  }

  for (const finding of openFindings) {
    if (matchedIds.has(finding.id)) continue;
    if (
      !shouldResolveOpenFinding({
        finding,
        scopedFileSet,
        runtimeRan,
      })
    ) {
      continue;
    }
    finding.status = "resolved";
    finding.resolvedNote = "No longer detected by the latest assessment.";
    addEvidence(db, {
      kind: "finding",
      summary: `${finding.checkId}: ${formatLocationRef(finding.location)} no longer detected`,
      projectId,
      controlId: control.id,
      findingId: finding.id,
      assessmentId,
      detail: { event: "resolved" },
    });
    onFindingResolved(finding);
  }
}

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
    kind: "finding",
    summary: `${raw.checkId}: ${formatLocationRef(raw.location)} — ${raw.reason}`,
    projectId: project.id,
    controlId,
    findingId: finding.id,
    assessmentId,
    detail: {
      event: "detected",
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
