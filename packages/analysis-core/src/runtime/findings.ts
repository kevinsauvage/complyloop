import type { Confidence, Severity } from "../contract/statuses";
import type { RawFinding } from "../types";
import { checkIdForAxeRule } from "./axe-map";

import type { RuntimePageSnapshot } from "./site-level/types";
import { runSiteLevelChecks } from "./site-level/checks";

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
  snapshot?: RuntimePageSnapshot;
}

export interface RuntimeScanResult {
  findings: RawFinding[];
  pagesScanned: number;
  siteLevelChecksRan?: boolean;
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

/**
 * Converts axe page results into RawFindings with `kind: "dom"` locations.
 * Pure — used by the Playwright runner and unit tests.
 */
export function findingsFromAxePages(
  pages: ReadonlyArray<RuntimeScanPageResult>,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const page of pages) {
    for (const violation of page.violations) {
      const checkId = checkIdForAxeRule(violation.id);
      if (!checkId) continue;
      for (const node of violation.nodes) {
        findings.push({
          checkId,
          kind: "violation",
          severity: severityFromImpact(violation.impact),
          confidence: "high" satisfies Confidence,
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
        });
      }
    }
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
