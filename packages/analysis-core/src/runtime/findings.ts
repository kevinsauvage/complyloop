import { axeCorePackageVersion } from "../analyzer-versions.ts";
import {
  HEURISTIC_RUNTIME_DOWNGRADE,
  isHeuristicCheck,
} from "../check-authority.ts";
import type { CheckId } from "../check-registry.ts";
import type { Confidence, Severity } from "../contract/statuses.ts";
import { dedupeRuntimeFindings } from "../merge-findings.ts";
import type { RawFinding } from "../types.ts";
import type { ApplicabilityObservation } from "./applicability.ts";
import { checkIdForAxeRule } from "./axe-map.ts";
import { htmlSnippet, selectorFromTarget } from "./dom-location.ts";
import { rawFindingFromDom } from "./raw-finding-from-dom.ts";
import { normalizeRoutes } from "./routes.ts";
import { runSiteLevelChecks } from "./site-level/checks.ts";
import type { RuntimePageSnapshot } from "./site-level/types.ts";

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
  /**
   * True only when navigation returned 2xx, the final URL still matches the
   * audited path, and the document rendered. Verify/assessment must treat
   * anything else as “page not shown” (fail closed).
   */
  loadedCleanly?: boolean;
  /** Playwright `page.url()` after settle — used to detect login-wall redirects. */
  finalUrl?: string;
  /** axe incomplete nodes — emitted as `warning` findings (`needs_review`). */
  incomplete?: AxeViolationLike[];
  snapshot?: RuntimePageSnapshot;
  /** Playwright custom-probe findings for this page. */
  customFindings?: RawFinding[];
  /** html-validate rendered findings for this page. */
  htmlValidateFindings?: RawFinding[];
  /** html-validate rendered pass succeeded on this page. */
  htmlValidateRan?: boolean;
  /** Deterministic absence probes for applicability-gated checks. */
  applicabilityObservations?: ApplicabilityObservation[];
  /** Custom probes that threw on this page (contained, not fatal — P2-5). */
  probeFailures?: string[];
}

export interface RuntimeScanResult {
  findings: RawFinding[];
  pagesScanned: number;
  siteLevelChecksRan?: boolean;
  /** Whether html-validate's rendered pass ran on any page. */
  htmlValidateRan?: boolean;
  /** linkinator same-origin link check ran on preview routes. */
  linkCheckRan?: boolean;
  /** Check ids confirmed not applicable on every audited page (checkId → fact). */
  applicabilityFacts?: ReadonlyMap<CheckId, string>;
  /** Unique custom-probe ids that threw on at least one page (P2-5). */
  probeFailures?: string[];
  /**
   * Per-page scan failures contained by the page loop (axe crash, navigation
   * failure, …). Sibling pages' findings are kept; a total outage (zero
   * pages, non-empty here) still surfaces as `error` above.
   */
  pageFailures?: RuntimePageFailure[];
  error?: string;
}

/** One contained per-page runtime failure (axe crash, navigation, …). */
export interface RuntimePageFailure {
  url: string;
  error: string;
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
    const asReview =
      kind === "warning" || violation.id === "frame-tested" || heuristic;
    for (const node of violation.nodes) {
      findings.push(
        rawFindingFromDom({
          checkId,
          kind: asReview ? "warning" : "violation",
          severity: heuristic
            ? HEURISTIC_RUNTIME_DOWNGRADE.severity
            : severityFromImpact(violation.impact),
          confidence: asReview ? "medium" : confidence,
          reason: `${violation.help} ${violation.description}`.trim(),
          url: page.url,
          selector: selectorFromTarget(node.target),
          snippet: htmlSnippet(node.html),
          elementLabel: node.elementLabel,
          context: node.failureSummary,
          analyzerId: "axe",
          analyzerRuleId: violation.id,
          analyzerVersion: axeCorePackageVersion(),
        }),
      );
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
    if (page.customFindings) {
      pageFindings.push(...page.customFindings);
    }
    if (page.htmlValidateFindings) {
      pageFindings.push(...page.htmlValidateFindings);
    }
    findings.push(...dedupeRuntimeFindings(pageFindings));
  }
  return findings;
}

export function siteLevelFindingsFromPages(
  pages: ReadonlyArray<RuntimeScanPageResult>,
): RawFinding[] {
  const snapshots = pages
    .map((page) => page.snapshot)
    .filter(
      (snapshot): snapshot is RuntimePageSnapshot => snapshot !== undefined,
    );
  return runSiteLevelChecks(snapshots);
}

export function runtimeRoutesFor(project: {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
}): string[] {
  if (!project.runtimeBaseUrl?.trim()) return [];
  const routes = normalizeRoutes(project.runtimeRoutes ?? []);
  return routes.length > 0 ? routes : ["/"];
}

export function joinRuntimeUrl(baseUrl: string, route: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (route.startsWith("http://") || route.startsWith("https://")) return route;
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${base}${path}`;
}
