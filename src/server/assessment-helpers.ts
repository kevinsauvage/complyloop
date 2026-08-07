import fs from "node:fs";
import { describeFix, previewFixedLine } from "@/analysis/fixes";
import { isCompositionSensitiveCheck } from "@/analysis/check-authority";
import { scanFile } from "@/analysis/scan";
import type { RawFinding } from "@/analysis/types";
import { resolveInside } from "@/analysis/workspace-path";
import { isDomLocation, isSourceLocation } from "@/core/location";
import type {
  Finding,
  FindingLocation,
  Project,
  ProposedFix,
  RemediationSuggestion,
} from "@/core/types";

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
  project: Project,
  finding: Pick<Finding, "checkId" | "location">,
): RawFinding | undefined {
  const location = finding.location;
  if (!isSourceLocation(location)) return undefined;
  const violations = scanFile(project.rootPath, location.filePath).filter(
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
  project: Project,
  raw: Pick<RawFinding, "location" | "fix">,
): RemediationSuggestion | null {
  if (!raw.fix) return null;
  if (!isSourceLocation(raw.location)) return null;
  const text = fs.readFileSync(
    resolveInside(project.rootPath, raw.location.filePath),
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

/**
 * When runtime owns composition-sensitive rules, drop AST findings for those
 * check ids so requirement status is not driven by false primitive hits.
 */
export function filterAstFindingsForAuthority(
  astFindings: ReadonlyArray<RawFinding>,
  runtimeRan: boolean,
): RawFinding[] {
  if (!runtimeRan) return [...astFindings];
  return astFindings.filter(
    (finding) => !isCompositionSensitiveCheck(finding.checkId),
  );
}

export function findingLocationMatchesScope(
  location: FindingLocation,
  scopedFileSet: Set<string> | null,
): boolean {
  if (!scopedFileSet) return true;
  if (!isSourceLocation(location)) return true;
  return scopedFileSet.has(location.filePath);
}
