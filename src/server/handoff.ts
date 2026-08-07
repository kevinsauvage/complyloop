import fs from "node:fs";
import { createTwoFilesPatch } from "diff";
import { applyFix } from "@/analysis/fixes";
import { resolveInside } from "@/analysis/workspace-path";
import { formatLocationRef, isSourceLocation } from "@/core/location";
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
  /** Absolute path of the file that would change, when a source fix exists. */
  filePath: string | null;
}

export function buildDiffForFix(
  rootPath: string,
  finding: Finding,
  fix: ProposedFix,
): string {
  if (!isSourceLocation(finding.location)) {
    throw new Error("Diffs require a source location.");
  }
  const absolute = resolveInside(rootPath, finding.location.filePath);
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
  /** When set, builds a file-based diff from the checkout; otherwise snippet fallback. */
  rootPath?: string,
): DeveloperHandoff {
  const title = `fix(a11y): ${control.code} — ${control.title}`;
  const suggestion = remediation.suggestion;
  const explanation = finding.explanations[0];
  const locationRef = formatLocationRef(finding.location);
  const verificationSteps =
    finding.location.kind === "dom"
      ? [
          `1. Fix the unlabeled/incorrect control in the form that renders on this page (not in a shared Input primitive unless every consumer is wrong).`,
          `2. Re-run the runtime audit on \`${finding.location.url}\` — the \`${finding.checkId}\` issue at \`${finding.location.selector}\` must be gone.`,
          `3. Keep the evidence trail (assessment + remediation history) for audit.`,
        ]
      : [
          `1. Apply the patch (or approve/apply in ComplyLoop).`,
          `2. Re-run the \`${finding.checkId}\` check — it must no longer fail at this location.`,
          `3. Keep the evidence trail (assessment + remediation history) for audit.`,
        ];

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
    `**Location:** \`${locationRef}\``,
    finding.engine ? `**Engine:** \`${finding.engine}\`` : "",
    ``,
    "```",
    finding.location.snippet,
    "```",
    ``,
    `## Proposed change`,
    ``,
    suggestion?.description ??
      (finding.location.kind === "dom"
        ? "Locate the call site that renders this control and associate a visible `<label>` or accessible name. Do not add a generic aria-label on a shared primitive."
        : "See finding detail for remediation guidance."),
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
    ...verificationSteps,
    ``,
    `---`,
    `Generated for project \`${project.name}\` · remediation status: \`${remediation.status}\``,
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n");

  let diff: string | null = null;
  if (finding.fix && isSourceLocation(finding.location) && rootPath) {
    try {
      diff = buildDiffForFix(rootPath, finding, finding.fix);
    } catch {
      diff = null;
    }
  }
  if (
    !diff &&
    suggestion?.proposedSnippet &&
    isSourceLocation(finding.location)
  ) {
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
    filePath:
      finding.fix && isSourceLocation(finding.location) && rootPath
        ? resolveInside(rootPath, finding.location.filePath)
        : null,
  };
}
