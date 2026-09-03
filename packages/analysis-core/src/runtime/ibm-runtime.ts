import type { Page } from "playwright";
import type { Confidence, FindingKind, Severity } from "../contract/statuses.js";
import type { RawFinding } from "../types.js";
import { checkIdForAxeRule } from "./axe-map.js";
import { checkIdForIbmRule } from "./ibm-map.js";
import type { RuntimeScanPageResult } from "./findings.js";

interface IbmIssue {
  ruleId: string;
  level?: string;
  message?: string;
  snippet?: string;
  path?: { dom?: string };
  help?: string;
}

interface IbmReport {
  results?: IbmIssue[];
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim().toLowerCase();
}

function severityForLevel(level: string | undefined): Severity {
  if (level === "potentialviolation") return "moderate";
  return "serious";
}

function kindForLevel(level: string | undefined): FindingKind {
  if (level === "potentialviolation") return "warning";
  return "violation";
}

function confidenceForLevel(level: string | undefined): Confidence {
  if (level === "potentialviolation") return "medium";
  return "high";
}

function axeSnippetKeys(page: RuntimeScanPageResult): Set<string> {
  const keys = new Set<string>();
  for (const violation of page.violations) {
    const checkId = checkIdForAxeRule(violation.id);
    if (!checkId) continue;
    for (const node of violation.nodes) {
      keys.add(`${checkId}::${normalizeSnippet(node.html)}`);
    }
  }
  return keys;
}

function shouldSkipIbmFinding(
  checkId: RawFinding["checkId"],
  snippet: string,
  axeSnippets: Set<string>,
): boolean {
  return axeSnippets.has(`${checkId}::${normalizeSnippet(snippet)}`);
}

export function ibmFindingsFromReport(
  report: IbmReport,
  url: string,
  axePage: RuntimeScanPageResult,
): RawFinding[] {
  const axeSnippets = axeSnippetKeys(axePage);
  const findings: RawFinding[] = [];

  for (const issue of report.results ?? []) {
    const checkId = checkIdForIbmRule(issue.ruleId);
    if (!checkId) continue;
    const snippet = (issue.snippet ?? issue.path?.dom ?? "(unknown)")
      .replace(/\s+/g, " ")
      .trim();
    if (shouldSkipIbmFinding(checkId, snippet, axeSnippets)) continue;

    const xpath = issue.path?.dom;
    findings.push({
      checkId,
      kind: kindForLevel(issue.level),
      severity: severityForLevel(issue.level),
      confidence: confidenceForLevel(issue.level),
      reason: `IBM Equal Access [${issue.ruleId}]: ${issue.message ?? "Accessibility issue"}`,
      location: {
        kind: "dom",
        url,
        selector: xpath ? `xpath:${xpath}` : "(unknown)",
        snippet: snippet.length > 200 ? `${snippet.slice(0, 197)}…` : snippet,
        context: issue.help,
      },
      fix: null,
      engine: "runtime",
    });
  }

  return findings;
}

/** Runs IBM Equal Access on the live Playwright page (after axe). */
export async function ibmFindingsForPage(
  page: Page,
  url: string,
  axePage: RuntimeScanPageResult,
): Promise<RawFinding[]> {
  const { getCompliance } = await import("accessibility-checker");
  const label = `complyloop-${url.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80)}`;
  const result = await getCompliance(page, label);
  const report = result.report;
  if (!report || "details" in report) return [];
  return ibmFindingsFromReport(report as IbmReport, url, axePage);
}