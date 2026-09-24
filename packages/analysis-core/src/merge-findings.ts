/**
 * Merge stage (stage 3 of the analysis pipeline): combines AST + runtime raw
 * findings, drops superseded AST rows when runtime ran (scoped to the pages the
 * audit rendered via `RuntimeFileCoverage`), and dedupes
 * (`dedupeRuntimeFindings`). Pure — authority classes come from
 * `check-authority.ts`. See `packages/analysis-core/README.md`.
 */
import {
  isCompositionSensitiveCheck,
  isPackageTwinSourceCheck,
  isRuntimeOnlyCheck,
} from "./check-authority.ts";
import {
  ANALYZER_META,
  type AnalyzerContribution,
  type AnalyzerId,
} from "./contract/finding-types.ts";
import { normalizeSnippetKey } from "./runtime/dom-location.ts";
import type { RawFinding } from "./types.ts";

/**
 * Which source files the runtime audit actually rendered, so its authority can
 * be scoped instead of applied to the whole repo. Built by the app layer from
 * `RuntimeScanResult.scannedRoutes` + the checkout's route↔file map.
 */
export interface RuntimeFileCoverage {
  /** True when a rendered route was found for every discovered page file. */
  fullyCovered: boolean;
  /** Page files the audit rendered (used when not `fullyCovered`). */
  coveredFiles: ReadonlySet<string>;
}

/**
 * When runtime owns composition-sensitive OR runtime-only rules, drop AST
 * findings for those check ids so requirement status is not driven by false
 * primitive hits and a defect seen on both source and rendered DOM yields one
 * finding, not two.
 *
 * The runtime audit only renders `project.runtimeRoutes` (default `["/"]`), so
 * the drop is scoped to what it covered:
 * - `coverage` omitted/`null` → coverage is unknown (e.g. a checkout with no
 *   discoverable Next.js page files). Keep AST findings: a false `passed` is
 *   worse than a duplicate finding.
 * - `fullyCovered` → every page was rendered; drop as before.
 * - otherwise → drop only findings whose source file the audit rendered.
 */
export function filterAstFindingsForAuthority(
  astFindings: ReadonlyArray<RawFinding>,
  runtimeRan: boolean,
  coverage?: RuntimeFileCoverage | null,
): RawFinding[] {
  if (!runtimeRan) return [...astFindings];
  const supersededByRuntime = (finding: RawFinding): boolean =>
    isCompositionSensitiveCheck(finding.checkId) ||
    isRuntimeOnlyCheck(finding.checkId) ||
    isPackageTwinSourceCheck(finding.checkId);
  if (!coverage) return [...astFindings];
  if (coverage.fullyCovered) {
    return astFindings.filter((finding) => !supersededByRuntime(finding));
  }
  return astFindings.filter((finding) => {
    if (!supersededByRuntime(finding)) return true;
    return !(
      finding.location.kind === "source" &&
      coverage.coveredFiles.has(finding.location.filePath)
    );
  });
}

/** Combines AST + runtime findings after applying runtime authority over AST. */
export function mergeRawFindings(
  astFindings: RawFinding[],
  runtimeFindings: RawFinding[],
  runtimeRan: boolean,
  coverage?: RuntimeFileCoverage | null,
): RawFinding[] {
  const filteredAst = filterAstFindingsForAuthority(
    astFindings,
    runtimeRan,
    coverage,
  ).map((finding) => ({
    ...finding,
    analyzerId: finding.analyzerId ?? ("ast" as const),
  }));
  return [...filteredAst, ...runtimeFindings];
}

function analyzerPriority(id: AnalyzerId): number {
  return ANALYZER_META[id].priority;
}

function effectiveAnalyzerId(finding: RawFinding): AnalyzerId {
  if (finding.analyzerId) return finding.analyzerId;
  // Runtime-dedupe only sees runtime findings, which always name an analyzer;
  // default to ast for hand-built fixtures.
  return "ast";
}

/** Stable key for collapsing dom/runtime findings on the same node. */
function runtimeFindingLocationKey(finding: RawFinding): string | null {
  const location = finding.location;
  if (location.kind === "site") return null;
  if (location.kind === "dom") {
    // Two distinct nodes can share a snippet (identical markup), so the node
    // selector is part of node identity. Fall back to the snippet only when
    // no usable selector is reported.
    const selector =
      location.selector && location.selector !== "(unknown)"
        ? normalizeSnippetKey(location.selector)
        : "";
    return `${location.url}::${finding.checkId}::${selector}::${normalizeSnippetKey(location.snippet)}`;
  }
  return null;
}

function contributionKey(entry: AnalyzerContribution): string {
  return `${entry.analyzerId}::${entry.analyzerRuleId ?? ""}`;
}

function contributionFromFinding(finding: RawFinding): AnalyzerContribution {
  return {
    analyzerId: effectiveAnalyzerId(finding),
    ...(finding.analyzerRuleId
      ? { analyzerRuleId: finding.analyzerRuleId }
      : {}),
    ...(finding.analyzerVersion
      ? { analyzerVersion: finding.analyzerVersion }
      : {}),
  };
}

function mergeContributors(
  winner: RawFinding,
  loser: RawFinding,
): AnalyzerContribution[] {
  const merged = new Map<string, AnalyzerContribution>();
  for (const entry of winner.contributingAnalyzers ?? []) {
    merged.set(contributionKey(entry), entry);
  }
  for (const entry of loser.contributingAnalyzers ?? []) {
    merged.set(contributionKey(entry), entry);
  }

  const loserPrimary = contributionFromFinding(loser);
  const winnerPrimary = contributionFromFinding(winner);
  if (contributionKey(loserPrimary) !== contributionKey(winnerPrimary)) {
    merged.set(contributionKey(loserPrimary), loserPrimary);
  }

  return [...merged.values()];
}

/**
 * Collapses runtime findings that share a check id and dom node.
 * Priority: axe > html-validate > playwright-custom. html-validate and axe
 * do not overlap on check ids (exclusive ownership).
 * Site-level findings are never merged with dom findings.
 */
export function dedupeRuntimeFindings(
  findings: ReadonlyArray<RawFinding>,
): RawFinding[] {
  const passthrough: RawFinding[] = [];
  const groups = new Map<string, RawFinding[]>();

  for (const finding of findings) {
    const key = runtimeFindingLocationKey(finding);
    if (!key) {
      passthrough.push(finding);
      continue;
    }
    const bucket = groups.get(key) ?? [];
    bucket.push(finding);
    groups.set(key, bucket);
  }

  const deduped: RawFinding[] = [...passthrough];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]!);
      continue;
    }

    let winner = group[0]!;
    for (let index = 1; index < group.length; index += 1) {
      const candidate = group[index]!;
      const winnerPriority = analyzerPriority(effectiveAnalyzerId(winner));
      const candidatePriority = analyzerPriority(
        effectiveAnalyzerId(candidate),
      );
      if (candidatePriority < winnerPriority) {
        winner = {
          ...candidate,
          contributingAnalyzers: mergeContributors(candidate, winner),
        };
      } else {
        winner = {
          ...winner,
          contributingAnalyzers: mergeContributors(winner, candidate),
        };
      }
    }
    deduped.push(winner);
  }

  return deduped;
}
