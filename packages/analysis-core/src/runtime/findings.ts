import type { Confidence, Severity } from "../contract/statuses.js";
import { axeCorePackageVersion } from "../analyzer-versions.js";
import { isHeuristicCheck } from "../check-authority.js";
import type { RawFinding } from "../types.js";
import { checkIdForAxeRule } from "./axe-map.js";
import { dedupeRuntimeFindings } from "./dedupe-runtime-findings.js";

import type { RuntimePageSnapshot } from "./site-level/types.js";
import { runSiteLevelChecks } from "./site-level/checks.js";

interface AxeNodeLike {
  html: string;
  target: string[];
  failureSummary?: string;
  elementLabel?: string;
}

export interface AxeViolationLike {
  id: string;
  impact?: string | null;
  description: string;
  help: string;
  nodes: AxeNodeLike[];
}

export interface RuntimeScanPageResult {
  url: string;
  violations: AxeViolationLike[];
  /** axe incomplete nodes — emitted as `warning` findings (`needs_review`). */
  incomplete?: AxeViolationLike[];
  snapshot?: RuntimePageSnapshot;
  /** html-validate rendered findings for this page. */
  htmlValidateFindings?: RawFinding[];
  /** IBM Equal Access findings for this page (deduped vs axe). */
  ibmFindings?: RawFinding[];
  /** html-validate rendered pass succeeded on this page. */
  htmlValidateRan?: boolean;
  /** IBM Equal Access succeeded on this page. */
  ibmCheckerRan?: boolean;
}

export interface RuntimeScanResult {
  findings: RawFinding[];
  pagesScanned: number;
  siteLevelChecksRan?: boolean;
  /** Whether html-validate's rendered pass ran on any page. */
  htmlValidateRan?: boolean;
  /** IBM Equal Access ran on any page. */
  ibmCheckerRan?: boolean;
  /** linkinator same-origin link check ran on preview routes. */
  linkCheckRan?: boolean;
  error?: string;
}

function severityFromImpact(impact: string | null | undefined): Severity {
  switch (impact) {
    case "critical":
      return "critical";
    case "serious":
      return "serious";
    case "moderate":
      return "moderate";
    case "minor":
      return "minor";
    default:
      return "serious";
  }
}

function selectorOf(node: AxeNodeLike): string {
  const first = node.target[0];
  return typeof first === "string" && first.length > 0 ? first : "(unknown)";
}

function snippetOf(node: AxeNodeLike): string {
  const trimmed = node.html.replace(/\s+/g, " ").trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

function findingsFromAxeHits(
  page: RuntimeScanPageResult,
  hits: ReadonlyArray<AxeViolationLike>,
  kind: RawFinding["kind"],
  confidence: Confidence,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const violation of hits) {
    const checkId = checkIdForAxeRule(violation.id);
    if (!checkId) continue;
    const heuristic = isHeuristicCheck(checkId);
    const asReview = kind === "warning" || violation.id === "frame-tested" || heuristic;
    for (const node of violation.nodes) {
      const customProbe = violation.id.startsWith("complyloop-");
      findings.push({
        checkId,
        kind: asReview ? "warning" : "violation",
        severity: heuristic
          ? "moderate"
          : severityFromImpact(violation.impact),
        confidence: asReview ? "medium" : confidence,
        reason: `${violation.help} ${violation.description}`.trim(),
        location: {
          kind: "dom",
          url: page.url,
          selector: selectorOf(node),
          snippet: snippetOf(node),
          elementLabel: node.elementLabel,
          context: node.failureSummary,
        },
        fix: null,
        engine: "runtime",
        analyzerId: customProbe ? "playwright-custom" : "axe",
        analyzerRuleId: violation.id,
        analyzerVersion: customProbe ? undefined : axeCorePackageVersion(),
      });
    }
  }
  return findings;
}

/**
 * Converts axe page results into RawFindings with `kind: "dom"` locations.
 * Pure — used by the Playwright runner and unit tests.
 */
export function findingsFromAxePages(
  pages: ReadonlyArray<RuntimeScanPageResult>,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const page of pages) {
    const pageFindings: RawFinding[] = [
      ...findingsFromAxeHits(page, page.violations, "violation", "high"),
    ];
    if (page.incomplete) {
      pageFindings.push(
        ...findingsFromAxeHits(page, page.incomplete, "warning", "medium"),
      );
    }
    if (page.htmlValidateFindings) {
      pageFindings.push(...page.htmlValidateFindings);
    }
    if (page.ibmFindings) pageFindings.push(...page.ibmFindings);
    findings.push(...dedupeRuntimeFindings(pageFindings));
  }
  return findings;
}

export function siteLevelFindingsFromPages(
  pages: ReadonlyArray<RuntimeScanPageResult>,
): RawFinding[] {
  const snapshots = pages
    .map((page) => page.snapshot)
    .filter((snapshot): snapshot is RuntimePageSnapshot => snapshot !== undefined);
  return runSiteLevelChecks(snapshots);
}

export function runtimeRoutesFor(project: {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
}): string[] {
  if (!project.runtimeBaseUrl?.trim()) return [];
  const routes = project.runtimeRoutes?.filter((route) => route.trim().length > 0);
  return routes && routes.length > 0 ? routes : ["/"];
}

export function joinRuntimeUrl(baseUrl: string, route: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (route.startsWith("http://") || route.startsWith("https://")) return route;
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${base}${path}`;
}
