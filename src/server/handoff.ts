import fs from "node:fs";
import path from "node:path";
import { applyFix } from "@/analysis/fixes";
import type {
  Control,
  Finding,
  Project,
  ProposedFix,
  Remediation,
} from "@/core/types";

export interface DeveloperHandoff {
  title: string;
  body: string;
  diff: string | null;
  /** Absolute path of the file that would change, when a fix exists. */
  filePath: string | null;
}

function unifiedHunk(
  filePath: string,
  original: string,
  fixed: string,
  focusLine: number,
): string {
  const before = original.split("\n");
  const after = fixed.split("\n");
  const context = 2;
  const start = Math.max(0, focusLine - 1 - context);
  const endBefore = Math.min(before.length, focusLine + context);
  const endAfter = Math.min(after.length, focusLine + context + (after.length - before.length));

  const oldLines = before.slice(start, endBefore);
  const newLines = after.slice(start, endAfter);
  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${start + 1},${oldLines.length} +${start + 1},${newLines.length} @@`,
  ];
  const body: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i += 1) {
    const a = oldLines[i];
    const b = newLines[i];
    if (a === b) {
      body.push(` ${a ?? ""}`);
    } else {
      if (a !== undefined) body.push(`-${a}`);
      if (b !== undefined) body.push(`+${b}`);
    }
  }
  return [...header, ...body].join("\n");
}

export function buildDiffForFix(
  project: Project,
  finding: Finding,
  fix: ProposedFix,
): string {
  const absolute = path.join(project.rootPath, finding.location.filePath);
  const original = fs.readFileSync(absolute, "utf8");
  const fixed = applyFix(original, fix);
  return unifiedHunk(
    finding.location.filePath,
    original,
    fixed,
    finding.location.line,
  );
}

export function buildDeveloperHandoff(
  project: Project,
  control: Control,
  finding: Finding,
  remediation: Remediation,
): DeveloperHandoff {
  const title = `fix(a11y): ${control.code} — ${control.title}`;
  const suggestion = remediation.suggestion;
  const explanation = finding.explanations[0];

  const body = [
    `## Requirement`,
    ``,
    `- **${control.code}** / ${control.secondaryCode} — ${control.title}`,
    `- ${control.description}`,
    ``,
    `## Failure`,
    ``,
    finding.reason,
    ``,
    `**Location:** \`${finding.location.filePath}:${finding.location.line}\``,
    ``,
    "```",
    finding.location.snippet,
    "```",
    ``,
    `## Proposed change`,
    ``,
    suggestion?.description ?? "See finding detail for remediation guidance.",
    ``,
    suggestion
      ? ["```", suggestion.proposedSnippet, "```", ""].join("\n")
      : "",
    `## Why this solves it`,
    ``,
    explanation?.howToFix ?? "Apply the proposed change and re-run the automated check.",
    ``,
    `## Verification`,
    ``,
    `1. Apply the patch (or approve/apply in ComplyLoop).`,
    `2. Re-run the \`${finding.checkId}\` check — it must no longer fail at this location.`,
    `3. Keep the evidence trail (assessment + remediation history) for audit.`,
    ``,
    `---`,
    `Generated for project \`${project.name}\` · remediation status: \`${remediation.status}\``,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  let diff: string | null = null;
  if (finding.fix) {
    try {
      diff = buildDiffForFix(project, finding, finding.fix);
    } catch {
      diff = null;
    }
  }
  // Fall back when the file already changed (stale spans) or there is no automatable fix.
  if (!diff && suggestion?.proposedSnippet) {
    diff = [
      `--- a/${finding.location.filePath}`,
      `+++ b/${finding.location.filePath}`,
      `@@ suggested (review before apply) @@`,
      `-${finding.location.snippet}`,
      `+${suggestion.proposedSnippet}`,
    ].join("\n");
  }

  return {
    title,
    body,
    diff,
    filePath: finding.fix
      ? path.join(project.rootPath, finding.location.filePath)
      : null,
  };
}
