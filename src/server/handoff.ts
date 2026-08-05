import fs from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
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

export function buildDiffForFix(
  project: Project,
  finding: Finding,
  fix: ProposedFix,
): string {
  const absolute = path.join(project.rootPath, finding.location.filePath);
  const original = fs.readFileSync(absolute, "utf8");
  const fixed = applyFix(original, fix);
  return createTwoFilesPatch(
    `a/${finding.location.filePath}`,
    `b/${finding.location.filePath}`,
    original,
    fixed,
    undefined,
    undefined,
    { context: 3 },
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
    diff = createTwoFilesPatch(
      `a/${finding.location.filePath}`,
      `b/${finding.location.filePath}`,
      `${finding.location.snippet}\n`,
      `${suggestion.proposedSnippet}\n`,
      "current",
      "suggested",
      { context: 0 },
    );
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
