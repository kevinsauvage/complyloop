import fs from "node:fs";
import { describeFix, previewFixedLine } from "@/analysis/fixes";
import { scanFile } from "@/analysis/scan";
import type { RawFinding } from "@/analysis/types";
import { resolveInside } from "@/analysis/workspace-path";
import type {
  Finding,
  Project,
  ProposedFix,
  RemediationSuggestion,
} from "@/core/types";

/**
 * Findings are matched across assessments by file plus snippet (or line as a
 * fallback) so remediation state survives re-assessment and dismissals stick.
 */
export function sameInstance(
  finding: Pick<Finding, "location">,
  raw: RawFinding,
): boolean {
  return (
    finding.location.filePath === raw.location.filePath &&
    (finding.location.snippet === raw.location.snippet ||
      finding.location.line === raw.location.line)
  );
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
 * Warnings are ignored — they carry no fix.
 */
export function locateViolationInProject(
  project: Project,
  finding: Pick<Finding, "checkId" | "location">,
): RawFinding | undefined {
  const violations = scanFile(
    project.rootPath,
    finding.location.filePath,
  ).filter(
    (candidate) =>
      candidate.checkId === finding.checkId && candidate.kind === "violation",
  );
  return violations.find(
    (candidate) =>
      candidate.location.snippet === finding.location.snippet ||
      candidate.location.line === finding.location.line,
  );
}

export function buildSuggestion(
  project: Project,
  raw: Pick<RawFinding, "location" | "fix">,
): RemediationSuggestion | null {
  if (!raw.fix) return null;
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

