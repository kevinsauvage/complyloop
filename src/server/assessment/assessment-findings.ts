import "server-only";

import fs from "node:fs";

import { guidanceFor } from "@complyloop/analysis-core/catalog/registry";
import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type {
  FindingLocation,
  ProposedFix,
  RemediationSuggestion,
} from "@complyloop/analysis-core/contract/finding-types";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import {
  formatLocationRef,
  isDomLocation,
  isSiteLocation,
  isSourceLocation,
} from "@complyloop/analysis-core/contract/location";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { describeFix, previewFixedLine } from "@complyloop/analysis-core/fixes";
import { scanFile } from "@complyloop/analysis-core/scan";
import type { RawFinding } from "@complyloop/analysis-core/types";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";

import { deterministicExplanation } from "@/ai/explainer";

import { appendEvidence, type ProjectRows } from "../workspace/project-rows";

/**
 * Findings are matched across assessments by location identity so remediation
 * state survives re-assessment and dismissals stick.
 *
 * Source identity is snippet-first: when both sides carry a snippet, only
 * (whitespace-normalized) snippet equality matches (line numbers drift with
 * unrelated edits, so a line-only match would refresh a stale row instead of
 * resolving it and creating the new instance). Line equality is only a
 * fallback when at least one side has no snippet to compare.
 *
 * DOM identity is the node selector (same as runtime dedupe): many contrast /
 * name failures share identical markup snippets, so snippet-only matching
 * keeps stale opens alive while new nodes accumulate every run.
 */
export function sameInstance(
  finding: { location: FindingLocation },
  raw: { location: FindingLocation },
): boolean {
  const left = finding.location;
  const right = raw.location;
  if (left.kind !== right.kind) return false;
  if (isSourceLocation(left) && isSourceLocation(right)) {
    if (left.filePath !== right.filePath) return false;
    if (hasSnippet(left.snippet) && hasSnippet(right.snippet)) {
      return (
        normalizeSourceSnippet(left.snippet) ===
        normalizeSourceSnippet(right.snippet)
      );
    }
    return left.line === right.line;
  }
  if (isDomLocation(left) && isDomLocation(right)) {
    if (left.url !== right.url) return false;
    const leftSelector = usableDomSelector(left.selector);
    const rightSelector = usableDomSelector(right.selector);
    if (leftSelector && rightSelector) {
      return leftSelector === rightSelector;
    }
    // Selector missing on either side — fall back to snippet identity.
    return left.snippet === right.snippet;
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

function usableDomSelector(selector: string): string {
  const trimmed = selector.trim();
  return trimmed && trimmed !== "(unknown)" ? trimmed : "";
}

/** A snippet counts for identity only when it carries non-blank content. */
function hasSnippet(snippet: string): boolean {
  return snippet.trim().length > 0;
}

/**
 * Source identity key: collapses all whitespace runs (indentation, line
 * breaks, CRLF) so formatting-only changes — Prettier reflows, moved lines —
 * do not churn findings and orphan remediation state. Case- and
 * content-sensitive otherwise: unlike the DOM `normalizeSnippetKey`, JSX
 * source cannot lowercase. Two violations that differ only by whitespace in
 * the same file and check intentionally share an instance.
 */
export function normalizeSourceSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim();
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
 * snippet when both sides carry one, else by line fallback) so fixes use
 * current character offsets after drift.
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
    if (
      hasSnippet(location.snippet) &&
      hasSnippet(candidate.location.snippet)
    ) {
      return (
        normalizeSourceSnippet(candidate.location.snippet) ===
        normalizeSourceSnippet(location.snippet)
      );
    }
    return candidate.location.line === location.line;
  });
}

/**
 * Per-run memo of source file text keyed by absolute path. Many findings in one
 * assessment share a file, so `buildSuggestion` should not re-read (and re-read)
 * the same file for each new finding.
 */
export type FileTextCache = Map<string, string>;

function readFileText(
  cache: FileTextCache | undefined,
  absolutePath: string,
): string {
  if (!cache) return fs.readFileSync(absolutePath, "utf8");
  const cached = cache.get(absolutePath);
  if (cached !== undefined) return cached;
  const text = fs.readFileSync(absolutePath, "utf8");
  cache.set(absolutePath, text);
  return text;
}

export function buildSuggestion(
  rootPath: string,
  raw: Pick<RawFinding, "location" | "fix">,
  fileTextCache?: FileTextCache,
): RemediationSuggestion | null {
  if (!raw.fix) return null;
  if (!isSourceLocation(raw.location)) return null;
  const text = readFileText(
    fileTextCache,
    resolveInside(rootPath, raw.location.filePath),
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
  rows: ProjectRows;
  project: Project;
  control: Control;
  assessmentId: string;
  rootPath: string;
  rawForControl: RawFinding[];
  scopedFileSet: Set<string> | null;
  runtimeRan: boolean;
  /** Shared per-run file-text memo so suggestion building reads each file once. */
  fileTextCache?: FileTextCache;
  onFindingResolved: (finding: Finding) => void;
}

function isRuntimeOwnedFinding(finding: Finding): boolean {
  if (isDomLocation(finding.location) || isSiteLocation(finding.location)) {
    return true;
  }
  return engineFor(finding) === "runtime";
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
 * Mutates `rows` only (never the loaded workspace WorkspaceSlice).
 */
export function reconcileControlFindings(
  input: ReconcileControlFindingsInput,
): void {
  const {
    rows,
    project,
    control,
    assessmentId,
    rootPath,
    rawForControl,
    scopedFileSet,
    runtimeRan,
    fileTextCache,
    onFindingResolved,
  } = input;
  const projectId = project.id;

  const openFindings = rows.findings.filter(
    (finding) =>
      finding.projectId === projectId &&
      finding.controlId === control.id &&
      finding.status === "open",
  );
  const dismissedFindings = rows.findings.filter(
    (finding) =>
      finding.projectId === projectId &&
      finding.controlId === control.id &&
      finding.status === "dismissed",
  );

  const matchedIds = new Set<string>();
  // Include findings created in this pass so duplicate raw hits update the
  // same open row instead of minting siblings (axe can emit overlapping nodes).
  const matchPool = [...openFindings];
  for (const raw of rawForControl) {
    // A dismissal never blinds future runs: re-detection re-opens the
    // dismissed row (status + current assessment + re-detected evidence)
    // instead of dropping the raw hit or minting a duplicate.
    const redetected = dismissedFindings.find((finding) =>
      sameInstance(finding, raw),
    );
    if (redetected) {
      matchedIds.add(redetected.id);
      redetected.status = "open";
      redetected.dismissal = undefined;
      redetected.resolvedNote = undefined;
      redetected.assessmentId = assessmentId;
      redetected.fix = mergeFix(redetected.fix, raw.fix);
      redetected.location = raw.location;
      if (raw.analyzerId) redetected.analyzerId = raw.analyzerId;
      if (raw.analyzerRuleId) redetected.analyzerRuleId = raw.analyzerRuleId;
      if (raw.analyzerVersion) redetected.analyzerVersion = raw.analyzerVersion;
      if (raw.contributingAnalyzers?.length) {
        redetected.contributingAnalyzers = raw.contributingAnalyzers;
      }
      if (!matchPool.includes(redetected)) matchPool.push(redetected);
      appendEvidence(rows, {
        kind: "finding",
        summary: `${redetected.checkId}: ${formatLocationRef(redetected.location)} re-detected after dismissal`,
        projectId,
        controlId: control.id,
        findingId: redetected.id,
        assessmentId,
        detail: { event: "re-detected" },
      });
      continue;
    }
    const existing = matchPool.find((finding) => sameInstance(finding, raw));
    if (existing) {
      matchedIds.add(existing.id);
      // `assessmentId` stays write-once (creation / re-detection assessment):
      // bumping it on every match would rewrite every open finding each run
      // and defeat the no-op upsert optimization. Liveness across runs is
      // proven by resolves + per-run evidence, not by this id.
      existing.fix = mergeFix(existing.fix, raw.fix);
      existing.location = raw.location;
      if (raw.analyzerId) existing.analyzerId = raw.analyzerId;
      if (raw.analyzerRuleId) existing.analyzerRuleId = raw.analyzerRuleId;
      if (raw.analyzerVersion) existing.analyzerVersion = raw.analyzerVersion;
      if (raw.contributingAnalyzers?.length) {
        existing.contributingAnalyzers = raw.contributingAnalyzers;
      }
    } else {
      createFinding(
        rows,
        project,
        rootPath,
        control.id,
        assessmentId,
        raw,
        fileTextCache,
      );
      const created = rows.findings[rows.findings.length - 1];
      if (created) {
        matchPool.push(created);
        matchedIds.add(created.id);
      }
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
    appendEvidence(rows, {
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
  rows: ProjectRows,
  project: Project,
  rootPath: string,
  controlId: string,
  assessmentId: string,
  raw: RawFinding,
  fileTextCache?: FileTextCache,
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
    analyzerId: raw.analyzerId,
    analyzerRuleId: raw.analyzerRuleId,
    analyzerVersion: raw.analyzerVersion,
    contributingAnalyzers: raw.contributingAnalyzers,
    fix: raw.fix,
    explanations: [deterministicExplanation(raw.reason, guidance)],
    detectedAt: now,
  };
  rows.findings.push(finding);

  const suggestion = buildSuggestion(rootPath, raw, fileTextCache);
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
  rows.remediations.push(remediation);

  appendEvidence(rows, {
    kind: "finding",
    summary: `${raw.checkId}: ${formatLocationRef(raw.location)} — ${raw.reason}`,
    projectId: project.id,
    controlId,
    findingId: finding.id,
    assessmentId,
    detail: {
      event: "detected",
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
