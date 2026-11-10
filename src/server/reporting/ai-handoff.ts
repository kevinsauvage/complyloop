/**
 * "Copy for AI" handoffs: Markdown prompts a developer pastes into their own
 * coding assistant. Plain text only — nothing here calls a model, writes
 * evidence, or changes a status; the assistant's answer re-enters the product
 * only through the normal human-approved remediation flow.
 */
import "server-only";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import {
  formatLocationRef,
  locationSnippet,
} from "@complyloop/analysis-core/contract/location";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";

import { effectiveBranch } from "@/server/github/tracked-branch";

type HandoffControl = Pick<
  Control,
  "code" | "secondaryCode" | "title" | "description"
>;

type HandoffProject = Pick<Project, "name" | "github" | "runtimeBaseUrl">;

export type UnverifiableRequirementHandoff = {
  control: HandoffControl;
  /** Human label for why automation could not decide (`unableToVerifyReasonLabel`). */
  reason: string;
};

export type FindingHandoff = {
  control: HandoffControl;
  finding: Pick<
    Finding,
    | "checkId"
    | "severity"
    | "confidence"
    | "reason"
    | "location"
    | "explanations"
    | "analyzerId"
    | "analyzerRuleId"
  >;
};

function repoLine(project: HandoffProject): string {
  if (!project.github) return `Project: ${project.name}`;
  const branch = effectiveBranch(project.github);
  return `Repository: ${project.github.fullName}${branch ? ` (branch \`${branch}\`)` : ""}`;
}

function controlRef(control: HandoffControl): string {
  const codes = [control.code, control.secondaryCode].filter(Boolean);
  return `${codes.join(" · ")} — ${control.title}`;
}

/** Fence longer than any backtick run in `text`, so snippets cannot break out. */
function fenced(text: string, lang = ""): string {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${text}\n${fence}`;
}

function snippetLang(finding: FindingHandoff["finding"]): string {
  if (finding.location.kind === "dom") return "html";
  if (finding.location.kind === "source") {
    const ext = finding.location.filePath.split(".").pop() ?? "";
    return /^(tsx|jsx|ts|js|html|vue|svelte|css)$/.test(ext) ? ext : "";
  }
  return "";
}

function baselineExplanation(finding: FindingHandoff["finding"]) {
  return (
    finding.explanations.find(
      (explanation) => explanation.provenance === "deterministic",
    ) ?? finding.explanations[0]
  );
}

function locationLines(finding: FindingHandoff["finding"]): string[] {
  const { location } = finding;
  switch (location.kind) {
    case "source":
      return [`- File: \`${location.filePath}:${location.line}\``];
    case "dom":
      return [
        `- Rendered page: ${location.url}`,
        `- Selector: \`${location.selector}\``,
        "- Trace the selector to the component that renders it (text often comes from props, not literals).",
      ];
    case "site":
      return [`- Site-level: ${formatLocationRef(location)}`];
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}

function findingBody(item: FindingHandoff): string[] {
  const { finding } = item;
  const explanation = baselineExplanation(finding);
  const rule = finding.analyzerRuleId
    ? `${finding.checkId} (${finding.analyzerId ?? "ast"}: ${finding.analyzerRuleId})`
    : finding.checkId;
  const snippet = locationSnippet(finding.location);
  return [
    `- Requirement: ${controlRef(item.control)}`,
    `- Rule: \`${rule}\` · severity ${finding.severity} · confidence ${finding.confidence}`,
    ...locationLines(finding),
    "",
    `What failed: ${explanation?.whyItFailed ?? finding.reason}`,
    ...(explanation ? [`How to fix: ${explanation.howToFix}`] : []),
    ...(snippet ? ["", fenced(snippet, snippetLang(finding))] : []),
  ];
}

/** All `unable_to_verify` requirements → one manual-review prompt. */
export function unableToVerifyHandoff(
  project: HandoffProject,
  items: readonly UnverifiableRequirementHandoff[],
): string {
  const lines = [
    `# Manual accessibility review — ${project.github?.fullName ?? project.name}`,
    "",
    repoLine(project),
    ...(project.runtimeBaseUrl
      ? [`Preview URL: ${project.runtimeBaseUrl}`]
      : []),
    "",
    `ComplyLoop could not verify the ${items.length} RGAA / WCAG requirement${items.length === 1 ? "" : "s"} below automatically. For each one:`,
    "",
    "1. Inspect the relevant code (components, pages, styles). Where only the rendered page can tell, say exactly what to check in the browser.",
    "2. Give a verdict — **Pass**, **Fail**, or **Not applicable** — with a one-line justification citing file paths.",
    "3. For each Fail, propose a minimal code change as a diff.",
    "",
    "Answer with one section per requirement, headed by its code. Do not guess: if the code cannot settle it, say what a human must check.",
  ];
  items.forEach((item, index) => {
    lines.push(
      "",
      `## ${index + 1}. ${controlRef(item.control)}`,
      "",
      ...(item.control.description ? [item.control.description, ""] : []),
      `Why not automated: ${item.reason}`,
    );
  });
  return `${lines.join("\n")}\n`;
}

/** One finding → a focused fix prompt. */
export function findingHandoff(
  project: HandoffProject,
  item: FindingHandoff,
): string {
  const lines = [
    `# Fix accessibility finding — ${controlRef(item.control)}`,
    "",
    repoLine(project),
    "",
    ...findingBody(item),
    "",
    "## Task",
    "",
    "1. Find where this is rendered in the codebase.",
    "2. Make the smallest change that fixes it without altering behavior or visuals beyond what the fix requires.",
    "3. Return the change as a diff and explain how to verify it (keyboard, screen reader, or contrast check as relevant).",
  ];
  return `${lines.join("\n")}\n`;
}

/** Several findings (e.g. the open findings on a list page) → one batch prompt. */
export function findingsBatchHandoff(
  project: HandoffProject,
  items: readonly FindingHandoff[],
): string {
  const lines = [
    `# Fix ${items.length} accessibility finding${items.length === 1 ? "" : "s"} — ${project.github?.fullName ?? project.name}`,
    "",
    repoLine(project),
    "",
    "For each finding below: find where it is rendered, make the smallest fix, and return a diff. Group findings that share a root cause (one component fix often closes several). Explain how to verify each fix.",
  ];
  items.forEach((item, index) => {
    lines.push(
      "",
      `## ${index + 1}. ${controlRef(item.control)}`,
      "",
      ...findingBody(item),
    );
  });
  return `${lines.join("\n")}\n`;
}
