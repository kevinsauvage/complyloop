import fs from "node:fs";
import { describeFix, previewFixedLine } from "@complyloop/analysis-core/fixes";
import { scanFile } from "@complyloop/analysis-core/scan";
import type { RawFinding } from "@complyloop/analysis-core/types";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import { isDomLocation, isSiteLocation, isSourceLocation } from "@complyloop/analysis-core/contract/location";
import type { Finding, FindingLocation, ProposedFix, RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";

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

export function findingLocationMatchesScope(
  location: FindingLocation,
  scopedFileSet: Set<string> | null,
): boolean {
  if (!scopedFileSet) return true;
  if (!isSourceLocation(location)) return true;
  return scopedFileSet.has(location.filePath);
}
